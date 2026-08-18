var selected_songs = [];

(function () {
    "use strict";

    var CATALOG_URLS = ["data/data.json", "data.json", "data/songs.json"];
    var DOWNLOAD_TYPES = ["chords", "lyrics", "openlp", "chordpro"];
    var PDF_JOINER_URL = "https://utils.obedmr.com/urls/mergePDFs?";
    var LANGUAGE_STORAGE_KEY = "chordiebook.language";
    var currentLanguage = "en";
    var catalogSongs = [];
    var catalogURLPrefix = "";
    var selectedSongIds = {};
    var sortState = {
        key: "name",
        direction: "asc"
    };
    var COLUMNS = [
        { key: "name", label: "name", sortable: true },
        { key: "key", label: "key", sortable: true },
        { key: "themes", label: "themes", sortable: true },
        { key: "authors", label: "authors", sortable: true },
        { key: "action", label: "open" }
    ];
    var TRANSLATIONS = {
        en: {
            authors: "Authors",
            catalogError: "Unable to load the song catalog. Tried: {paths}.",
            catalogLoaded: "{count} songs loaded.",
            chords: "Chords",
            chordpro: "ChordPro",
            downloadSelected: "Download selected",
            eyebrow: "Song library",
            formatChords: "PDF chords",
            formatLyrics: "PDF lyrics",
            heroDescription: "Search, select, and download worship songs in the format your team needs.",
            key: "Key",
            loadingCatalog: "Loading catalog...",
            lyrics: "Lyrics",
            name: "Name",
            noSelection: "Select at least one song to download.",
            open: "Open",
            openMany: "Are you sure that you want to open {count} documents?",
            openlp: "OpenLP",
            searchLabel: "Search songs",
            searchPlaceholder: "Search by song name...",
            selectSong: "Select song",
            selectVisible: "Select visible songs",
            selected: "selected",
            sortAscending: "Asc",
            sortBy: "Sort by",
            sortDescending: "Desc",
            sortDirection: "Sort direction",
            themes: "Themes"
        },
        es: {
            authors: "Autores",
            catalogError: "No se pudo cargar el catalogo de canciones. Se intento: {paths}.",
            catalogLoaded: "{count} canciones cargadas.",
            chords: "Acordes",
            chordpro: "ChordPro",
            downloadSelected: "Descargar seleccionadas",
            eyebrow: "Biblioteca de canciones",
            formatChords: "PDF acordes",
            formatLyrics: "PDF letras",
            heroDescription: "Busca, selecciona y descarga canciones en el formato que tu equipo necesita.",
            key: "Tono",
            loadingCatalog: "Cargando catalogo...",
            lyrics: "Letras",
            name: "Nombre",
            noSelection: "Selecciona al menos una cancion para descargar.",
            open: "Abrir",
            openMany: "Seguro que quieres abrir {count} documentos?",
            openlp: "OpenLP",
            searchLabel: "Buscar canciones",
            searchPlaceholder: "Buscar por nombre...",
            selectSong: "Seleccionar cancion",
            selectVisible: "Seleccionar canciones visibles",
            selected: "seleccionadas",
            sortAscending: "Asc",
            sortBy: "Ordenar por",
            sortDescending: "Desc",
            sortDirection: "Direccion de ordenamiento",
            themes: "Temas"
        }
    };

    function isSupportedLanguage(language) {
        return Object.prototype.hasOwnProperty.call(TRANSLATIONS, language);
    }

    function normalizeLanguage(language) {
        var normalized = (language || "").toString().toLowerCase().split("-")[0];
        return isSupportedLanguage(normalized) ? normalized : "";
    }

    function getPathLanguage() {
        return /^\/es(?:\/|$)/i.test(window.location.pathname) ? "es" : "";
    }

    function getStoredLanguage() {
        try {
            return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
        } catch (error) {
            return "";
        }
    }

    function getBrowserLanguage() {
        var languages = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
        var language = "";

        languages.some(function (candidate) {
            language = normalizeLanguage(candidate);
            return !!language;
        });

        return language;
    }

    function getInitialLanguage() {
        return getPathLanguage() || getStoredLanguage() || getBrowserLanguage() || "en";
    }

    function translate(key) {
        return (TRANSLATIONS[currentLanguage] && TRANSLATIONS[currentLanguage][key]) || TRANSLATIONS.en[key] || key || "";
    }

    function interpolate(key, values) {
        return translate(key).replace(/\{([^}]+)\}/g, function (match, name) {
            return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match;
        });
    }

    function setCatalogStatus(key, values, isError) {
        var status = document.getElementById("catalogStatus");
        if (!status) {
            return;
        }

        status.dataset.statusKey = key;
        status.dataset.statusValues = JSON.stringify(values || {});
        status.textContent = interpolate(key, values || {});
        status.classList.toggle("is-error", !!isError);
    }

    function refreshCatalogStatus() {
        var status = document.getElementById("catalogStatus");
        if (!status || !status.dataset.statusKey) {
            return;
        }

        var values = {};
        try {
            values = JSON.parse(status.dataset.statusValues || "{}");
        } catch (error) {
            values = {};
        }
        status.textContent = interpolate(status.dataset.statusKey, values);
    }

    function getColumnLabel(key) {
        return translate(key);
    }

    function localizeTableHeaders() {
        COLUMNS.forEach(function (column) {
            Array.prototype.forEach.call(document.querySelectorAll("[data-column='" + column.key + "']"), function (header) {
                var label = getColumnLabel(column.label);
                var button = header.querySelector(".sort-button");
                if (button) {
                    button.textContent = label;
                } else {
                    header.textContent = label;
                }
            });

            Array.prototype.forEach.call(document.querySelectorAll("[data-label-key='" + column.label + "']"), function (cell) {
                cell.setAttribute("data-label", getColumnLabel(column.label));
            });
        });

        var selectAll = document.getElementById("selectAllSongs");
        if (selectAll) {
            selectAll.setAttribute("aria-label", translate("selectVisible"));
        }

        Array.prototype.forEach.call(document.querySelectorAll(".song-select"), function (checkbox) {
            checkbox.setAttribute("aria-label", translate("selectSong"));
        });
    }

    function applyLocalization(language, persist) {
        currentLanguage = normalizeLanguage(language) || "en";
        document.documentElement.lang = currentLanguage;

        Array.prototype.forEach.call(document.querySelectorAll("[data-i18n]"), function (element) {
            var value = translate(element.getAttribute("data-i18n"));
            if (value) {
                element.textContent = value;
            }
        });

        Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-placeholder]"), function (element) {
            var value = translate(element.getAttribute("data-i18n-placeholder"));
            if (value) {
                element.setAttribute("placeholder", value);
            }
        });

        Array.prototype.forEach.call(document.querySelectorAll("[data-language]"), function (element) {
            var active = element.getAttribute("data-language") === currentLanguage;
            element.classList.toggle("is-active", active);
            element.setAttribute("aria-pressed", active ? "true" : "false");
        });

        if (persist) {
            try {
                window.localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
            } catch (error) {
                return;
            }
        }

        refreshCatalogStatus();
        localizeTableHeaders();
        updateSortControls();
        renderSongs(catalogSongs);
    }

    function getTable() {
        return document.getElementById("myTable");
    }

    function getTableBody() {
        var table = getTable();
        return table ? table.querySelector("tbody") : null;
    }

    function getRows() {
        var tableBody = getTableBody();
        return tableBody ? Array.prototype.slice.call(tableBody.querySelectorAll("tr")) : [];
    }

    function normalizeText(value) {
        return (value || "").toString().trim().toUpperCase();
    }

    function normalizeURLPrefix(prefix) {
        if (!prefix) {
            return "";
        }
        return prefix.slice(-1) === "/" ? prefix : prefix + "/";
    }

    function joinCatalogURL(path) {
        if (!path) {
            return "";
        }
        if (/^https?:\/\//i.test(path)) {
            return path;
        }
        return catalogURLPrefix + path.replace(/^\/+/, "");
    }

    function getSongFiles(song) {
        return song && (song.files || song.urls) ? (song.files || song.urls) : {};
    }

    function getSongURL(song, type) {
        return joinCatalogURL(getSongFiles(song)[type]);
    }

    function updateSelectionCount() {
        var counter = document.getElementById("selectionCount");
        if (counter) {
            counter.textContent = selected_songs.length.toString();
        }
    }

    function updateSelectAllState() {
        var selectAll = document.getElementById("selectAllSongs");
        var visibleRows = getRows().filter(function (row) {
            return row.style.display !== "none";
        });
        var selectedRows = visibleRows.filter(function (row) {
            return !!selectedSongIds[row.dataset.songId];
        });

        if (!selectAll) {
            return;
        }

        selectAll.checked = visibleRows.length > 0 && selectedRows.length === visibleRows.length;
        selectAll.indeterminate = selectedRows.length > 0 && selectedRows.length < visibleRows.length;
    }

    function addSelectedSong(song) {
        if (!song || !song.id || selectedSongIds[song.id]) {
            return;
        }

        selectedSongIds[song.id] = true;
        selected_songs.push(song.id);
        updateSelectionCount();
    }

    function removeSelectedSong(song) {
        if (!song || !song.id || !selectedSongIds[song.id]) {
            return;
        }

        selectedSongIds[song.id] = false;
        selected_songs = selected_songs.filter(function (selectedSong) {
            return selectedSong !== song.id;
        });
        updateSelectionCount();
    }

    function getSongById(songId) {
        for (var i = 0; i < catalogSongs.length; i += 1) {
            if (catalogSongs[i].id === songId) {
                return catalogSongs[i];
            }
        }
        return null;
    }

    function getDownloadType() {
        var selected = document.querySelector("#downloadType input[type='radio']:checked");
        var value = selected ? selected.value : DOWNLOAD_TYPES[0];
        return DOWNLOAD_TYPES.indexOf(value) !== -1 ? value : DOWNLOAD_TYPES[0];
    }

    function openURL(url) {
        window.open(url, "_blank", "noopener");
    }

    function buildPDFJoinerURL(urls) {
        return PDF_JOINER_URL + urls.map(function (url) {
            return "urls[]=" + encodeURIComponent(url);
        }).join("&");
    }

    function createTextCell(value, labelKey, className) {
        var cell = document.createElement("td");
        cell.textContent = value || "";
        cell.dataset.labelKey = labelKey;
        cell.setAttribute("data-label", getColumnLabel(labelKey));
        if (className) {
            cell.className = className;
        }
        if (!value) {
            cell.classList.add("is-empty");
        }
        return cell;
    }

    function createActionCell(labelKey) {
        var cell = createTextCell("", labelKey, "song-action-cell");
        var button = document.createElement("button");

        cell.classList.remove("is-empty");
        button.type = "button";
        button.className = "song-action";
        button.textContent = translate("open");

        cell.appendChild(button);
        return cell;
    }

    function createSelectCell(song) {
        var cell = document.createElement("td");
        var checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.className = "song-select";
        checkbox.checked = !!selectedSongIds[song.id];
        checkbox.setAttribute("aria-label", translate("selectSong"));

        cell.className = "song-select-cell";
        cell.appendChild(checkbox);
        return cell;
    }

    function getSortableValue(song, key) {
        if (key === "themes" || key === "authors") {
            return normalizeText(Array.isArray(song[key]) ? song[key].join(", ") : "");
        }
        return normalizeText(song[key]);
    }

    function sortSongs(songs) {
        var direction = sortState.direction === "desc" ? -1 : 1;

        return songs.slice().sort(function (songA, songB) {
            var valueA = getSortableValue(songA, sortState.key);
            var valueB = getSortableValue(songB, sortState.key);

            if (valueA < valueB) {
                return -1 * direction;
            }
            if (valueA > valueB) {
                return 1 * direction;
            }
            return normalizeText(songA.name) < normalizeText(songB.name) ? -1 : 1;
        });
    }

    function getSongSearchText(song) {
        return normalizeText([
            song.name,
            song.key,
            Array.isArray(song.themes) ? song.themes.join(" ") : "",
            Array.isArray(song.authors) ? song.authors.join(" ") : ""
        ].join(" "));
    }

    function createSongRow(song) {
        var row = document.createElement("tr");

        row.dataset.songId = song.id;
        row.dataset.searchText = getSongSearchText(song);
        row.appendChild(createSelectCell(song));
        row.appendChild(createTextCell(song.name, "name", "song-name-cell"));
        row.appendChild(createTextCell(song.key, "key", "song-key-cell"));
        row.appendChild(createTextCell(Array.isArray(song.themes) ? song.themes.join(", ") : "", "themes", "song-themes-cell"));
        row.appendChild(createTextCell(Array.isArray(song.authors) ? song.authors.join(", ") : "", "authors", "song-authors-cell"));
        row.appendChild(createActionCell("open"));

        return row;
    }

    function renderSongs(songs) {
        var tableBody = getTableBody();
        var fragment = document.createDocumentFragment();

        if (!tableBody || !Array.isArray(songs) || songs.length === 0) {
            return;
        }

        sortSongs(songs).forEach(function (song) {
            fragment.appendChild(createSongRow(song));
        });

        tableBody.textContent = "";
        tableBody.appendChild(fragment);
        myFunction();
        updateSelectionCount();
        updateSelectAllState();
    }

    function myFunction() {
        var input = document.getElementById("myInput");
        var filter = normalizeText(input ? input.value : "");

        getRows().forEach(function (row) {
            row.style.display = !filter || row.dataset.searchText.indexOf(filter) > -1 ? "" : "none";
        });
        updateSelectAllState();
    }

    function fetchCatalog(urls) {
        var pending = urls.slice();
        var failures = [];

        function tryNext() {
            var url = pending.shift();
            if (!url) {
                throw new Error("Catalog not found. Tried: " + failures.join(", "));
            }

            return fetch(url)
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error(url + " returned HTTP " + response.status);
                    }
                    return response.json();
                })
                .catch(function (error) {
                    failures.push(error.message);
                    return tryNext();
                });
        }

        return tryNext();
    }

    function loadCatalog() {
        setCatalogStatus("loadingCatalog");

        return fetchCatalog(CATALOG_URLS)
            .then(function (catalog) {
                catalogSongs = Array.isArray(catalog.songs) ? catalog.songs : [];
                catalogURLPrefix = normalizeURLPrefix(catalog.url_prefix || "");
                selected_songs = [];
                selectedSongIds = {};
                renderSongs(catalogSongs);
                setCatalogStatus("catalogLoaded", { count: catalogSongs.length });
            })
            .catch(function (error) {
                setCatalogStatus("catalogError", { paths: CATALOG_URLS.join(", ") }, true);
                window.console.error("Unable to load catalog", error);
            });
    }

    function toggleSongSelection(checkbox) {
        var row = checkbox.closest("tr");
        var song = row ? getSongById(row.dataset.songId) : null;

        if (checkbox.checked) {
            addSelectedSong(song);
        } else {
            removeSelectedSong(song);
        }
        updateSelectAllState();
    }

    function toggleVisibleSongs(checked) {
        getRows().forEach(function (row) {
            var song = getSongById(row.dataset.songId);
            var checkbox = row.querySelector(".song-select");

            if (row.style.display === "none" || !checkbox) {
                return;
            }

            checkbox.checked = checked;
            if (checked) {
                addSelectedSong(song);
            } else {
                removeSelectedSong(song);
            }
        });
        updateSelectAllState();
    }

    function updateSortControls() {
        var sortColumn = document.getElementById("mobileSortColumn");
        var sortDirection = document.getElementById("mobileSortDirection");

        Array.prototype.forEach.call(document.querySelectorAll("[aria-sort]"), function (header) {
            header.setAttribute("aria-sort", header.dataset.column === sortState.key ? (sortState.direction === "asc" ? "ascending" : "descending") : "none");
        });

        if (sortColumn) {
            sortColumn.value = sortState.key;
        }

        if (sortDirection) {
            sortDirection.textContent = translate(sortState.direction === "asc" ? "sortAscending" : "sortDescending");
            sortDirection.dataset.direction = sortState.direction;
            sortDirection.setAttribute("aria-label", translate("sortDirection"));
        }
    }

    function setSort(columnKey, direction) {
        if (direction) {
            sortState.key = columnKey;
            sortState.direction = direction === "desc" ? "desc" : "asc";
        } else if (sortState.key === columnKey) {
            sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
        } else {
            sortState.key = columnKey;
            sortState.direction = "asc";
        }

        updateSortControls();
        renderSongs(catalogSongs);
    }

    function download() {
        var downloadType = getDownloadType();
        var selectedURLs = selected_songs.map(function (song) {
            return getSongURL(getSongById(song), downloadType);
        }).filter(Boolean);

        if (!selectedURLs.length) {
            window.alert(translate("noSelection"));
            return;
        }

        if (selectedURLs.length > 10 && !window.confirm(translate("openMany").replace("{count}", selectedURLs.length))) {
            return;
        }

        if (downloadType === "openlp" || downloadType === "chordpro") {
            selectedURLs.forEach(openURL);
            return;
        }

        openURL(buildPDFJoinerURL(selectedURLs));
    }

    function openSongAction(button) {
        var row = button.closest("tr");
        var song = row ? getSongById(row.dataset.songId) : null;
        var url = song ? getSongURL(song, getDownloadType()) : "";

        if (url) {
            openURL(url);
        }
    }

    function bindEvents() {
        var table = getTable();
        var selectAll = document.getElementById("selectAllSongs");
        var searchInput = document.getElementById("myInput");
        var mobileSortColumn = document.getElementById("mobileSortColumn");
        var mobileSortDirection = document.getElementById("mobileSortDirection");

        if (table) {
            table.addEventListener("change", function (event) {
                if (event.target.classList.contains("song-select")) {
                    toggleSongSelection(event.target);
                }
            });

            table.addEventListener("click", function (event) {
                var sortButton = event.target.closest(".sort-button");
                var actionButton = event.target.closest(".song-action");
                if (sortButton) {
                    setSort(sortButton.dataset.sort);
                    return;
                }
                if (actionButton) {
                    openSongAction(actionButton);
                }
            });
        }

        if (selectAll) {
            selectAll.addEventListener("change", function () {
                toggleVisibleSongs(selectAll.checked);
            });
        }

        if (searchInput) {
            searchInput.addEventListener("input", myFunction);
        }

        if (mobileSortColumn) {
            mobileSortColumn.addEventListener("change", function () {
                setSort(mobileSortColumn.value, "asc");
            });
        }

        if (mobileSortDirection) {
            mobileSortDirection.addEventListener("click", function () {
                setSort(sortState.key, sortState.direction === "asc" ? "desc" : "asc");
            });
        }

        Array.prototype.forEach.call(document.querySelectorAll("[data-language]"), function (button) {
            button.addEventListener("click", function () {
                applyLocalization(this.getAttribute("data-language"), true);
            });
        });
    }

    window.setLanguage = applyLocalization;
    window.myFunction = myFunction;
    window.download = download;

    document.addEventListener("DOMContentLoaded", function () {
        bindEvents();
        applyLocalization(getInitialLanguage(), false);
        loadCatalog();
        updateSelectionCount();
    });
}());
