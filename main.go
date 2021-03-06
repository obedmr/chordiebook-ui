package main

import (
	"fmt"
	"html/template"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
)

type Song struct {
	Name      string
	ChordsURL string
	LyricsURL string
	OpenLPURL string
}

const (
	ChordsPath = "pdf-chords/"
	LyricsPath = "pdf-lyrics/"
	OpenLPPath = "openlp/"
)

func checkError(err error) {
	if err != nil {
		log.Fatal(err)
	}
}

func main() {
	if len(os.Args) < 3 {
		fmt.Println("you must specify a bucket and S3 URL prefix")
		return
	}

	bucket := os.Args[1]
	urlPrefix := os.Args[2]

	sess := session.Must(session.NewSession())
	svc := s3.New(sess)
	songs := []Song{}

	err := svc.ListObjectsPages(&s3.ListObjectsInput{
		Bucket: &bucket,
	}, func(p *s3.ListObjectsOutput, last bool) (shouldContinue bool) {
		for _, obj := range p.Contents {
			if strings.HasPrefix(*obj.Key, ChordsPath) {
				name := strings.Replace(*obj.Key, ChordsPath, "", -1)
				chordsURL := urlPrefix + ChordsPath + name
				lyricsURL := urlPrefix + LyricsPath + name
				openLPURL := urlPrefix + OpenLPPath + name
				openLPURL = strings.ReplaceAll(openLPURL, ".pdf", ".xml")
				songName := strings.Join(strings.Split(name, "_"), " ")
				songName = strings.Split(songName, ".")[0]
				songName = strings.Title(songName)
				songs = append(songs, Song{songName, chordsURL, lyricsURL, openLPURL})
			}
		}
		return true
	})
	if err != nil {
		checkError(err)
	}

	// HTML Templating
	t, err := template.New("webpage").Parse(TPL)
	checkError(err)

	data := struct {
		Songs []Song
	}{
		Songs: songs,
	}

	err = t.Execute(os.Stdout, data)
	checkError(err)

}
