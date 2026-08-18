package main

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"flag"
	"fmt"
	"html/template"
	"io"
	"log/slog"
	"os"
	"path"
	"reflect"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
)

const (
	chordsPath  = "pdf-chords/"
	lyricsPath  = "pdf-lyrics/"
	openLPPath  = "openlp/"
	defaultOut  = "data/data.json"
	defaultHTML = "index.html"
)

type Config struct {
	Bucket      string
	URLPrefix   string
	Output      string
	Template    string
	IndexOutput string
	Concurrency int
	LogLevel    string
}

type Catalog struct {
	GeneratedAt time.Time `json:"generated_at"`
	Bucket      string    `json:"bucket"`
	URLPrefix   string    `json:"url_prefix"`
	Songs       []Song    `json:"songs"`
}

type Song struct {
	ID        string   `json:"id"`
	SourceKey string   `json:"source_key"`
	Name      string   `json:"name"`
	Key       string   `json:"key,omitempty"`
	Themes    []string `json:"themes,omitempty"`
	Authors   []string `json:"authors,omitempty"`
	URLs      SongURLs `json:"urls"`
}

type SongURLs struct {
	Chords   string `json:"chords"`
	Lyrics   string `json:"lyrics"`
	OpenLP   string `json:"openlp"`
	ChordPro string `json:"chordpro"`
}

type SongMetadata struct {
	XMLName xml.Name `xml:"song"`
	Key     string   `xml:"properties>key"`
	Authors []string `xml:"properties>authors>author"`
	Themes  []string `xml:"properties>themes>theme"`
}

type songResult struct {
	Song Song
	Key  string
	Err  error
}

type Summary struct {
	Total     int
	Added     int
	Updated   int
	Removed   int
	Unchanged int
	Failed    int
	Duration  time.Duration
}

func main() {
	startedAt := time.Now()
	cfg := parseConfig()
	logger := newLogger(cfg.LogLevel)

	if err := validateConfig(cfg); err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(2)
	}

	ctx := context.Background()
	logger.Info("starting catalog generation",
		"bucket", cfg.Bucket,
		"url_prefix", cfg.URLPrefix,
		"output", cfg.Output,
		"concurrency", cfg.Concurrency,
	)

	sess, err := session.NewSessionWithOptions(session.Options{
		SharedConfigState: session.SharedConfigEnable,
	})
	if err != nil {
		logger.Error("failed to create AWS session", "error", err)
		os.Exit(1)
	}

	svc := s3.New(sess)
	keys, err := listOpenLPKeys(ctx, svc, cfg.Bucket)
	if err != nil {
		logger.Error("failed to list S3 objects", "error", err)
		os.Exit(1)
	}
	logger.Info("listed OpenLP files", "count", len(keys), "prefix", openLPPath)

	previousCatalog, err := readCatalog(cfg.Output)
	if err != nil {
		logger.Warn("previous catalog unavailable; all songs will be treated as added", "path", cfg.Output, "error", err)
	}

	songs, failures := fetchSongs(ctx, logger, svc, cfg, keys)
	sort.Slice(songs, func(i, j int) bool {
		return strings.ToLower(songs[i].Name) < strings.ToLower(songs[j].Name)
	})

	summary := compareCatalogs(previousCatalog.Songs, songs)
	summary.Total = len(songs)
	summary.Failed = len(failures)
	summary.Duration = time.Since(startedAt)

	if len(failures) > 0 {
		logger.Error("catalog generation failed; output files were not updated",
			"failed", len(failures),
			"duration", summary.Duration.Round(time.Millisecond),
		)
		os.Exit(1)
	}

	generatedAt := previousCatalog.GeneratedAt
	if generatedAt.IsZero() || summary.Added+summary.Updated+summary.Removed > 0 {
		generatedAt = time.Now().UTC()
	}

	catalog := Catalog{
		GeneratedAt: generatedAt,
		Bucket:      cfg.Bucket,
		URLPrefix:   cfg.URLPrefix,
		Songs:       songs,
	}

	if err := writeCatalog(cfg.Output, catalog); err != nil {
		logger.Error("failed to write catalog", "path", cfg.Output, "error", err)
		os.Exit(1)
	}
	logger.Info("wrote catalog", "path", cfg.Output, "songs", len(songs))

	if err := renderIndex(cfg.Template, cfg.IndexOutput); err != nil {
		logger.Error("failed to render index", "template", cfg.Template, "output", cfg.IndexOutput, "error", err)
		os.Exit(1)
	}
	logger.Info("rendered static index", "path", cfg.IndexOutput)

	logger.Info("summary",
		"total", summary.Total,
		"added", summary.Added,
		"updated", summary.Updated,
		"removed", summary.Removed,
		"unchanged", summary.Unchanged,
		"failed", summary.Failed,
		"duration", summary.Duration.Round(time.Millisecond),
	)
}

func parseConfig() Config {
	cfg := Config{}
	flag.StringVar(&cfg.Bucket, "bucket", "chordiebook", "S3 bucket that contains the song files")
	flag.StringVar(&cfg.URLPrefix, "url-prefix", "https://chordiebook.s3-us-west-1.amazonaws.com/", "public URL prefix for generated song links")
	flag.StringVar(&cfg.Output, "output", defaultOut, "JSON catalog output path")
	flag.StringVar(&cfg.Template, "template", "template.html", "static HTML template path")
	flag.StringVar(&cfg.IndexOutput, "index-output", defaultHTML, "rendered static index output path")
	flag.IntVar(&cfg.Concurrency, "concurrency", 12, "number of parallel S3 metadata downloads")
	flag.StringVar(&cfg.LogLevel, "log-level", "info", "log level: debug, info, warn, error")
	flag.Parse()

	args := flag.Args()
	if len(args) > 0 {
		cfg.Bucket = args[0]
	}
	if len(args) > 1 {
		cfg.URLPrefix = args[1]
	}

	return cfg
}

func validateConfig(cfg Config) error {
	if strings.TrimSpace(cfg.Bucket) == "" {
		return errors.New("bucket is required")
	}
	if strings.TrimSpace(cfg.URLPrefix) == "" {
		return errors.New("url-prefix is required")
	}
	if !strings.HasSuffix(cfg.URLPrefix, "/") {
		return errors.New("url-prefix must end with /")
	}
	if cfg.Concurrency < 1 {
		return errors.New("concurrency must be at least 1")
	}
	return nil
}

func newLogger(level string) *slog.Logger {
	var slogLevel slog.Level
	switch strings.ToLower(level) {
	case "debug":
		slogLevel = slog.LevelDebug
	case "warn":
		slogLevel = slog.LevelWarn
	case "error":
		slogLevel = slog.LevelError
	default:
		slogLevel = slog.LevelInfo
	}

	return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slogLevel,
	}))
}

func listOpenLPKeys(ctx context.Context, svc *s3.S3, bucket string) ([]string, error) {
	var keys []string
	err := svc.ListObjectsV2PagesWithContext(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(openLPPath),
	}, func(page *s3.ListObjectsV2Output, last bool) bool {
		for _, obj := range page.Contents {
			key := aws.StringValue(obj.Key)
			if strings.HasPrefix(key, openLPPath) && strings.HasSuffix(strings.ToLower(key), ".xml") {
				keys = append(keys, key)
			}
		}
		return true
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(keys)
	return keys, nil
}

func fetchSongs(ctx context.Context, logger *slog.Logger, svc *s3.S3, cfg Config, keys []string) ([]Song, []songResult) {
	jobs := make(chan string)
	results := make(chan songResult)
	var wg sync.WaitGroup

	workers := cfg.Concurrency
	if workers > len(keys) && len(keys) > 0 {
		workers = len(keys)
	}

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for key := range jobs {
				song, err := buildSong(ctx, svc, cfg.Bucket, cfg.URLPrefix, key)
				results <- songResult{Song: song, Key: key, Err: err}
				if err == nil {
					logger.Debug("parsed song", "worker", workerID, "id", song.ID, "name", song.Name)
				}
			}
		}(i + 1)
	}

	go func() {
		for _, key := range keys {
			jobs <- key
		}
		close(jobs)
		wg.Wait()
		close(results)
	}()

	var songs []Song
	var failures []songResult
	for result := range results {
		if result.Err != nil {
			logger.Warn("failed to process song metadata", "key", result.Key, "error", result.Err)
			failures = append(failures, result)
			continue
		}
		songs = append(songs, result.Song)
	}

	return songs, failures
}

func buildSong(ctx context.Context, svc *s3.S3, bucket, urlPrefix, key string) (Song, error) {
	metadata, err := getSongMetadata(ctx, svc, bucket, key)
	if err != nil {
		return Song{}, err
	}

	id := songIDFromKey(key)
	return Song{
		ID:        id,
		SourceKey: key,
		Name:      titleFromID(id),
		Key:       strings.TrimSpace(metadata.Key),
		Themes:    cleanStrings(metadata.Themes),
		Authors:   cleanStrings(metadata.Authors),
		URLs: SongURLs{
			Chords:   urlPrefix + chordsPath + id + ".pdf",
			Lyrics:   urlPrefix + lyricsPath + id + ".pdf",
			OpenLP:   urlPrefix + openLPPath + id + ".xml",
			ChordPro: urlPrefix + id + ".cho",
		},
	}, nil
}

func getSongMetadata(ctx context.Context, svc *s3.S3, bucket, key string) (SongMetadata, error) {
	rawObject, err := svc.GetObjectWithContext(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return SongMetadata{}, err
	}
	defer rawObject.Body.Close()

	body, err := io.ReadAll(rawObject.Body)
	if err != nil {
		return SongMetadata{}, err
	}

	metadata := SongMetadata{}
	if err := xml.NewDecoder(bytes.NewReader(body)).Decode(&metadata); err != nil {
		return SongMetadata{}, err
	}

	return metadata, nil
}

func songIDFromKey(key string) string {
	filename := strings.TrimPrefix(key, openLPPath)
	return strings.TrimSuffix(filename, path.Ext(filename))
}

func titleFromID(id string) string {
	words := strings.Fields(strings.ReplaceAll(id, "_", " "))
	for i, word := range words {
		words[i] = titleWord(word)
	}
	return strings.Join(words, " ")
}

func titleWord(word string) string {
	if word == "" {
		return word
	}

	r, size := utf8.DecodeRuneInString(word)
	if r == utf8.RuneError {
		return word
	}
	return string(unicode.ToTitle(r)) + word[size:]
}

func cleanStrings(values []string) []string {
	cleaned := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			cleaned = append(cleaned, value)
		}
	}
	if len(cleaned) == 0 {
		return nil
	}
	return cleaned
}

func readCatalog(path string) (Catalog, error) {
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Catalog{}, nil
		}
		return Catalog{}, err
	}
	defer file.Close()

	catalog := Catalog{}
	if err := json.NewDecoder(file).Decode(&catalog); err != nil {
		return Catalog{}, err
	}
	return catalog, nil
}

func writeCatalog(path string, catalog Catalog) error {
	if err := os.MkdirAll(filepathDir(path), 0o755); err != nil {
		return err
	}

	payload, err := json.MarshalIndent(catalog, "", "  ")
	if err != nil {
		return err
	}
	payload = append(payload, '\n')

	return os.WriteFile(path, payload, 0o644)
}

func filepathDir(filePath string) string {
	dir := path.Dir(filePath)
	if dir == "." {
		return "."
	}
	return dir
}

func renderIndex(templatePath, outputPath string) error {
	tpl, err := template.ParseFiles(templatePath)
	if err != nil {
		return err
	}

	out, err := os.Create(outputPath)
	if err != nil {
		return err
	}
	defer out.Close()

	return tpl.Execute(out, nil)
}

func compareCatalogs(oldSongs, newSongs []Song) Summary {
	oldByID := map[string]Song{}
	newByID := map[string]Song{}
	for _, song := range oldSongs {
		oldByID[song.ID] = song
	}
	for _, song := range newSongs {
		newByID[song.ID] = song
	}

	var summary Summary
	for id, newSong := range newByID {
		oldSong, exists := oldByID[id]
		if !exists {
			summary.Added++
			continue
		}
		if reflect.DeepEqual(oldSong, newSong) {
			summary.Unchanged++
		} else {
			summary.Updated++
		}
	}

	for id := range oldByID {
		if _, exists := newByID[id]; !exists {
			summary.Removed++
		}
	}

	return summary
}

func (s Summary) String() string {
	return fmt.Sprintf("total=%d added=%d updated=%d removed=%d unchanged=%d failed=%d duration=%s",
		s.Total,
		s.Added,
		s.Updated,
		s.Removed,
		s.Unchanged,
		s.Failed,
		s.Duration.Round(time.Millisecond),
	)
}
