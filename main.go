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
	Name string
	URL  string
}

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
			URL := urlPrefix + *obj.Key
			songName := strings.Join(strings.Split(*obj.Key, "_"), " ")
			songName = strings.Split(songName, ".")[0]
			songs = append(songs, Song{songName, URL})
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
