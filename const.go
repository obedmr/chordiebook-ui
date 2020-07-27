package main

// TPL is a template for index.html file
const TPL = `
<!DOCTYPE html>
<html>
  <head>
    <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous">
    <script src="js/script.js"></script>
  </head>
  <body>
    <header>
      <div class="bg-dark collapse" id="navbarHeader" style="">
        <div class="container">
          <div class="row">
            <div class="col-sm-8 col-md-7 py-4">
              <h4 class="text-white">About</h4>
              <p class="text-muted">Add some information about the album below, the author, or any other background context. Make it a few sentences long so folks can pick up some informative tidbits. Then, link them off to some social networking sites or contact information.</p>
            </div>
            <div class="col-sm-4 offset-md-1 py-4">
              <h4 class="text-white">Contact</h4>
              <ul class="list-unstyled">
                <li><a href="#" class="text-white">Follow on Twitter</a></li>
                <li><a href="#" class="text-white">Like on Facebook</a></li>
                <li><a href="#" class="text-white">Email me</a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div class="navbar navbar-dark bg-dark box-shadow">
        <div class="container d-flex justify-content-between">
          <a href="#" class="navbar-brand d-flex align-items-center">
            <strong>ChordieBook</strong>
          </a>
          <button class="navbar-toggler collapsed" type="button" data-toggle="collapse" data-target="#navbarHeader" aria-controls="navbarHeader" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
        </div>
      </div>
    </header>
    <main role="main" class="container">
      <div class="jumbotron">
        <input type="text" id="myInput" onkeyup="myFunction()" class="form-control" placeholder="Search for songs...">
        </br>
        <table id="myTable" class="table table-striped table-bordered">
          <thead class="thead-dark">
            <th scope="col">Name</th>
            <th scope="col"></th>
            <th scope="col"></th>
          </thead>
          {{range .Songs}}<tr><td>{{ .Name }}</td><td><a href="{{ .ChordsURL }}" target="_blank">Chords</a></td><td><a href="{{ .LyricsURL }}" target="_blank">Lyrics</a></td></tr>{{end}}
        </table>
      </div>
    </main>
  </body>
</html>
`
