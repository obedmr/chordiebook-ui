package main

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"html/template"
	"log"
	"os"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
)

type Song struct {
	Name      string
	Themes    []string
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

func getTheme(svc *s3.S3, bucket string, obj *s3.Object) []string {
	rawObject, _ := svc.GetObject(
		&s3.GetObjectInput{
			Bucket: aws.String(bucket),
			Key:    obj.Key,
		})
	buf := new(bytes.Buffer)
	buf.ReadFrom(rawObject.Body)
	bytesBuff := buf.Bytes()

	q := struct {
		XMLName xml.Name `xml:"song"`
		Themes  []string `xml:"properties>themes>theme"`
	}{}
	xml.Unmarshal(bytesBuff, &q)
	return q.Themes
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
			if strings.HasPrefix(*obj.Key, OpenLPPath) {
				//fmt.Printf("%#v", obj)
				themes := getTheme(svc, bucket, obj)
				name := strings.Replace(*obj.Key, OpenLPPath, "", -1)
				name = strings.ReplaceAll(name, ".xml", "")
				chordsURL := urlPrefix + ChordsPath + name + ".pdf"
				lyricsURL := urlPrefix + LyricsPath + name + ".pdf"
				openLPURL := urlPrefix + OpenLPPath + name + ".xml"
				songName := strings.Join(strings.Split(name, "_"), " ")
				songName = strings.Split(songName, ".")[0]
				songName = strings.Title(songName)
				songs = append(songs, Song{songName, themes, chordsURL, lyricsURL, openLPURL})
			}
		}
		return true
	})
	if err != nil {
		checkError(err)
	}

	// HTML Templating
	t, err := template.ParseFiles("template.html")
	checkError(err)

	data := struct {
		Songs []Song
	}{
		Songs: songs,
	}

	err = t.Execute(os.Stdout, data)
	checkError(err)

}
