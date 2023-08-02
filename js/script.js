function myFunction() {
  // Declare variables
  var input, filter, table, tr, td, i;
  input = document.getElementById("myInput");
  filter = input.value.toUpperCase();
  table = document.getElementById("myTable");
  tr = table.getElementsByTagName("tr");

  // Loop through all table rows, and hide those who don't match the search query
  for (i = 0; i < tr.length; i++) {
    td = tr[i].getElementsByTagName("td")[1];
    if (td) {
      if (td.innerHTML.toUpperCase().indexOf(filter) > -1) {
        tr[i].style.display = "";
      } else {
        tr[i].style.display = "none";
      }
    }
  }
}

function download(){
    table = document.getElementById("myTable");
    tr = table.getElementsByTagName("tr");
    selectedURLs = [];
    downloadType = $('#downloadType input:radio:checked').val();
    counter = 0;

    for (i = 0; i < selected_songs.length; i++) {
	selectedURLs.push(selected_songs[i][downloadType])
    }

    answer = false
    if (counter > 10) {
	answer = window.confirm("Are you sure that you want to open "+counter+" documents?");
    }

    var pdfjoiner_url = "http://utils.obedmr.com/urls/mergePDFs?";

    if (counter <= 10 || answer)
	selectedURLs.forEach(
	    function(item) {
		url = item;
		pdfjoiner_url += "urls[]="+url+"&"
		if (downloadType == "openlp" || downloadType == "chordpro")
		    window.open(url, "_blank")
	    }
	)

    if (downloadType == "chords" || downloadType == "lyrics")
	window.open(pdfjoiner_url, "_blank")
}


var selected_songs = []

function getURL(str) {
    return str.match(/\bhttps?:\/\/\S+/gi)[0].replace('"', '')
}

$(function(){
    $('#myTable').on('check.bs.table', function (e, row, $element) {
	var selected_song = {
	    "chords" : getURL(row[5]),
	    "lyrics" : getURL(row[6]),
	    "openlp" : getURL(row[7]),
	    "chordpro" : getURL(row[8]),
	}
	selected_songs.push(selected_song)
});
});


function arrayRemove(arr, value) {
    return arr.filter(function(ele){
        return ele["chords"] != value;
    });
}

$(function(){
    $('#myTable').on('uncheck.bs.table', function (e, row, $element) {
	chords = getURL(row[4])
	selected_songs = arrayRemove(selected_songs, chords)
});
});
