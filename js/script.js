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
    downloadIdx = $('#downloadType input:radio:checked').val();
    counter = 0;

    for (i = 0; i < tr.length; i++) {
	if (tr[i].className == "selected"){
	    url = tr[i].getElementsByTagName("a")[downloadIdx].href;
	    selectedURLs.push(url);
	    counter++;
	}
    }

    answer = false
    if (counter > 10) {
	answer = window.confirm("Are you sure that you want to open "+counter+" documents?");
    }

    if (counter <= 10 || answer)
    selectedURLs.forEach(
	function(item, index, arr) {
	    url = arr[index];
	    window.open(url, "_blank");
	}
    )
}
