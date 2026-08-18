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
    var downloadCatalogPromise = null;
    var selectedSongIds = {};
    var downloadReviewIds = [];
    var downloadReviewDrag = null;
    var isPreparingDownload = false;
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
            cancel: "Cancel",
            close: "Close",
            confirmDownload: "Confirm download",
            downloadSelected: "Download selected",
            downloadReviewEmpty: "No songs selected for download.",
            downloadReviewEyebrow: "Review download",
            downloadReviewTitle: "Selected songs",
            downloadZipName: "chordiebook-{type}.zip",
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
            remove: "Remove",
            searchLabel: "Search songs",
            searchPlaceholder: "Search by song name...",
            selectSong: "Select song",
            selectVisible: "Select visible songs",
            selected: "selected",
            sortAscending: "Asc",
            sortBy: "Sort by",
            sortDescending: "Desc",
            sortDirection: "Sort direction",
            themes: "Themes",
            zipError: "Unable to create the ZIP file. Please try again.",
            zipMissing: "ZIP support is not available in this browser.",
            zipProgress: "Preparing ZIP... {done}/{total}"
        },
        es: {
            authors: "Autores",
            catalogError: "No se pudo cargar el catalogo de canciones. Se intento: {paths}.",
            catalogLoaded: "{count} canciones cargadas.",
            chords: "Acordes",
            chordpro: "ChordPro",
            cancel: "Cancelar",
            close: "Cerrar",
            confirmDownload: "Confirmar descarga",
            downloadSelected: "Descargar seleccionadas",
            downloadReviewEmpty: "No hay canciones seleccionadas para descargar.",
            downloadReviewEyebrow: "Revisar descarga",
            downloadReviewTitle: "Canciones seleccionadas",
            downloadZipName: "chordiebook-{type}.zip",
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
            remove: "Eliminar",
            searchLabel: "Buscar canciones",
            searchPlaceholder: "Buscar por nombre...",
            selectSong: "Seleccionar cancion",
            selectVisible: "Seleccionar canciones visibles",
            selected: "seleccionadas",
            sortAscending: "Asc",
            sortBy: "Ordenar por",
            sortDescending: "Desc",
            sortDirection: "Direccion de ordenamiento",
            themes: "Temas",
            zipError: "No se pudo crear el archivo ZIP. Intenta de nuevo.",
            zipMissing: "El navegador no tiene soporte para crear ZIP.",
            zipProgress: "Preparando ZIP... {done}/{total}"
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

        Array.prototype.forEach.call(document.querySelectorAll("[data-i18n-aria-label]"), function (element) {
            var value = translate(element.getAttribute("data-i18n-aria-label"));
            if (value) {
                element.setAttribute("aria-label", value);
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
        if (document.getElementById("downloadReviewModal") && !document.getElementById("downloadReviewModal").hidden) {
            renderDownloadReview();
        }
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

    function syncSongCheckbox(songId, checked) {
        getRows().forEach(function (row) {
            var checkbox = row.dataset.songId === songId ? row.querySelector(".song-select") : null;
            if (checkbox) {
                checkbox.checked = checked;
            }
        });
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

    function getSelectedSongIds() {
        return selected_songs.filter(function (songId) {
            return !!getSongById(songId);
        });
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

    function downloadBlob(blob, filename) {
        var link = document.createElement("a");
        var objectURL = URL.createObjectURL(blob);

        link.href = objectURL;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () {
            URL.revokeObjectURL(objectURL);
        }, 1000);
    }

    function getURLFileName(url, fallback) {
        var pathname;
        try {
            pathname = new URL(url, window.location.href).pathname;
        } catch (error) {
            pathname = url || "";
        }

        return decodeURIComponent((pathname.split("/").pop() || fallback || "song").replace(/[?#].*$/, ""));
    }

    function getUniqueFileName(filename, usedNames) {
        var safeName = (filename || "song").replace(/[\\/:*?"<>|]+/g, "-");
        var dotIndex = safeName.lastIndexOf(".");
        var base = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
        var extension = dotIndex > 0 ? safeName.slice(dotIndex) : "";
        var candidate = safeName;
        var index = 2;

        while (usedNames[candidate]) {
            candidate = base + "-" + index + extension;
            index += 1;
        }

        usedNames[candidate] = true;
        return candidate;
    }

    function setDownloadReviewStatus(key, values, isError) {
        var status = document.getElementById("downloadReviewStatus");
        if (!status) {
            return;
        }

        if (!key) {
            status.hidden = true;
            status.textContent = "";
            status.classList.remove("is-error");
            return;
        }

        status.hidden = false;
        status.textContent = interpolate(key, values || {});
        status.classList.toggle("is-error", !!isError);
    }

    function setDownloadReviewBusy(isBusy) {
        var confirm = document.getElementById("confirmDownloadReview");
        var cancel = document.getElementById("cancelDownloadReview");
        var close = document.getElementById("closeDownloadReview");

        isPreparingDownload = !!isBusy;
        if (confirm) {
            confirm.disabled = isPreparingDownload || downloadReviewIds.length === 0;
        }
        if (cancel) {
            cancel.disabled = isPreparingDownload;
        }
        if (close) {
            close.disabled = isPreparingDownload;
        }
    }

    function shouldZipDownload(downloadType, songIds) {
        return songIds.length > 1 && (downloadType === "openlp" || downloadType === "chordpro");
    }

    function getDownloadCatalogPath() {
        var app = document.querySelector(".app-main");
        return app && app.dataset.downloadCatalog ? app.dataset.downloadCatalog : "data/downloads.json";
    }

    function loadDownloadCatalog() {
        if (!downloadCatalogPromise) {
            downloadCatalogPromise = fetch(getDownloadCatalogPath())
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error(getDownloadCatalogPath() + " returned HTTP " + response.status);
                    }
                    return response.json();
                });
        }
        return downloadCatalogPromise;
    }

    function createZipFromDownloadCatalog(downloadCatalog, songIds, downloadType) {
        var zip;
        var usedNames = {};
        var completed = 0;
        var files = downloadCatalog && downloadCatalog.files ? downloadCatalog.files : {};

        if (!window.JSZip) {
            return Promise.reject(new Error(translate("zipMissing")));
        }

        zip = new window.JSZip();
        setDownloadReviewStatus("zipProgress", { done: completed, total: songIds.length });

        songIds.forEach(function (songId) {
            var song = getSongById(songId);
            var url = getSongURL(song, downloadType);
            var content = files[songId] ? files[songId][downloadType] : "";
            var filename = getUniqueFileName(getURLFileName(url, song ? song.name : "song"), usedNames);

            if (!content) {
                throw new Error("missing download content for " + songId);
            }

            zip.file(filename, content);
            completed += 1;
            setDownloadReviewStatus("zipProgress", { done: completed, total: songIds.length });
        });

        return zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        }).then(function (blob) {
            downloadBlob(blob, interpolate("downloadZipName", { type: downloadType }));
        });
    }

    function createZipDownload(songIds, downloadType) {
        return loadDownloadCatalog().then(function (downloadCatalog) {
            return createZipFromDownloadCatalog(downloadCatalog, songIds, downloadType);
        });
    }

    function runDownload(songIds, downloadType) {
        var downloadableSongIds = songIds.filter(function (songId) {
            return !!getSongURL(getSongById(songId), downloadType);
        });
        var selectedURLs = downloadableSongIds.map(function (songId) {
            return getSongURL(getSongById(songId), downloadType);
        });

        if (!selectedURLs.length) {
            window.alert(translate("noSelection"));
            return;
        }

        if (shouldZipDownload(downloadType, downloadableSongIds)) {
            setDownloadReviewBusy(true);
            createZipDownload(downloadableSongIds, downloadType)
                .then(function () {
                    closeDownloadReview(true);
                })
                .catch(function (error) {
                    window.console.error("Unable to create ZIP", error);
                    setDownloadReviewStatus(error && error.message === translate("zipMissing") ? "zipMissing" : "zipError", {}, true);
                    setDownloadReviewBusy(false);
                });
            return;
        }

        if (downloadType === "openlp" || downloadType === "chordpro") {
            selectedURLs.forEach(openURL);
            return;
        }

        openURL(buildPDFJoinerURL(selectedURLs));
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

    function closeDownloadReview(force) {
        var modal = document.getElementById("downloadReviewModal");
        if (isPreparingDownload && !force) {
            return;
        }
        if (modal) {
            modal.hidden = true;
        }
        isPreparingDownload = false;
        downloadReviewIds = [];
        setDownloadReviewStatus("");
    }

    function createRemoveReviewButton() {
        var button = document.createElement("button");

        button.type = "button";
        button.className = "review-remove-button";
        button.dataset.reviewAction = "remove";
        button.textContent = "X";
        button.setAttribute("aria-label", translate("remove"));
        return button;
    }

    function createDownloadReviewItem(song) {
        var item = document.createElement("li");
        var songInfo = document.createElement("div");
        var name = document.createElement("span");
        var meta = document.createElement("span");

        item.className = "download-review-item";
        item.dataset.songId = song.id;
        item.setAttribute("draggable", "false");
        songInfo.className = "download-review-song";
        name.className = "download-review-name";
        meta.className = "download-review-meta";

        name.textContent = song.name || "";
        meta.textContent = [song.key, Array.isArray(song.authors) ? song.authors.join(", ") : ""].filter(Boolean).join(" - ");
        songInfo.appendChild(name);
        songInfo.appendChild(meta);

        item.appendChild(songInfo);
        item.appendChild(createRemoveReviewButton());
        return item;
    }

    function renderDownloadReview() {
        var list = document.getElementById("downloadReviewList");
        var empty = document.getElementById("downloadReviewEmpty");
        var confirm = document.getElementById("confirmDownloadReview");
        var fragment = document.createDocumentFragment();

        if (!list) {
            return;
        }

        downloadReviewIds = downloadReviewIds.filter(function (songId) {
            return !!selectedSongIds[songId] && !!getSongById(songId);
        });

        downloadReviewIds.forEach(function (songId) {
            fragment.appendChild(createDownloadReviewItem(getSongById(songId)));
        });

        list.textContent = "";
        list.appendChild(fragment);

        if (empty) {
            empty.hidden = downloadReviewIds.length > 0;
        }

        if (confirm) {
            confirm.disabled = isPreparingDownload || downloadReviewIds.length === 0;
        }
    }

    function openDownloadReview(songIds, downloadType) {
        var modal = document.getElementById("downloadReviewModal");
        var confirm = document.getElementById("confirmDownloadReview");

        if (!modal) {
            runDownload(songIds, downloadType);
            return;
        }

        downloadReviewIds = songIds.slice();
        modal.dataset.downloadType = downloadType;
        setDownloadReviewStatus("");
        setDownloadReviewBusy(false);
        renderDownloadReview();
        modal.hidden = false;

        if (confirm) {
            confirm.focus();
        }
    }

    function syncDownloadReviewOrderFromDOM() {
        var list = document.getElementById("downloadReviewList");
        if (!list) {
            return;
        }
        downloadReviewIds = Array.prototype.map.call(list.querySelectorAll(".download-review-item"), function (item) {
            return item.dataset.songId;
        });
        selected_songs = downloadReviewIds.slice();
    }

    function removeDownloadReviewSong(songId) {
        var song = getSongById(songId);

        if (isPreparingDownload) {
            return;
        }

        removeSelectedSong(song);
        syncSongCheckbox(songId, false);
        downloadReviewIds = downloadReviewIds.filter(function (reviewSongId) {
            return reviewSongId !== songId;
        });
        updateSelectAllState();
        renderDownloadReview();
    }

    function startDownloadReviewDrag(item, pointerId) {
        if (isPreparingDownload) {
            return;
        }

        downloadReviewDrag = {
            item: item,
            pointerId: pointerId
        };
        item.classList.add("is-dragging");
        if (item.setPointerCapture) {
            item.setPointerCapture(pointerId);
        }
    }

    function moveDownloadReviewDrag(clientX, clientY) {
        var list = document.getElementById("downloadReviewList");
        var target = document.elementFromPoint(clientX, clientY);
        var targetItem = target ? target.closest(".download-review-item") : null;
        var draggingItem = downloadReviewDrag ? downloadReviewDrag.item : null;
        var targetRect;

        if (!list || !draggingItem || !targetItem || targetItem === draggingItem || targetItem.parentNode !== list) {
            return;
        }

        targetRect = targetItem.getBoundingClientRect();
        if (clientY > targetRect.top + targetRect.height / 2) {
            list.insertBefore(draggingItem, targetItem.nextSibling);
        } else {
            list.insertBefore(draggingItem, targetItem);
        }

        syncDownloadReviewOrderFromDOM();
    }

    function endDownloadReviewDrag() {
        if (!downloadReviewDrag) {
            return;
        }
        downloadReviewDrag.item.classList.remove("is-dragging");
        downloadReviewDrag = null;
        syncDownloadReviewOrderFromDOM();
    }

    function download() {
        var downloadType = getDownloadType();
        var selectedSongIdsForDownload = getSelectedSongIds();

        if (!selectedSongIdsForDownload.length) {
            window.alert(translate("noSelection"));
            return;
        }

        if (selectedSongIdsForDownload.length > 1) {
            openDownloadReview(selectedSongIdsForDownload, downloadType);
            return;
        }

        runDownload(selectedSongIdsForDownload, downloadType);
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
        var reviewModal = document.getElementById("downloadReviewModal");
        var reviewList = document.getElementById("downloadReviewList");
        var closeReview = document.getElementById("closeDownloadReview");
        var cancelReview = document.getElementById("cancelDownloadReview");
        var confirmReview = document.getElementById("confirmDownloadReview");

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

        if (reviewList) {
            reviewList.addEventListener("click", function (event) {
                var button = event.target.closest("[data-review-action='remove']");
                var item = button ? button.closest(".download-review-item") : null;
                var songId = item ? item.dataset.songId : "";

                if (!button || !songId) {
                    return;
                }

                removeDownloadReviewSong(songId);
            });

            reviewList.addEventListener("pointerdown", function (event) {
                var item = event.target.closest(".download-review-item");

                if (!item || event.target.closest("[data-review-action]")) {
                    return;
                }

                event.preventDefault();
                startDownloadReviewDrag(item, event.pointerId);
            });

            reviewList.addEventListener("pointermove", function (event) {
                if (!downloadReviewDrag || downloadReviewDrag.pointerId !== event.pointerId) {
                    return;
                }

                event.preventDefault();
                moveDownloadReviewDrag(event.clientX, event.clientY);
            });

            reviewList.addEventListener("pointerup", function (event) {
                if (downloadReviewDrag && downloadReviewDrag.pointerId === event.pointerId) {
                    endDownloadReviewDrag();
                }
            });

            reviewList.addEventListener("pointercancel", function (event) {
                if (downloadReviewDrag && downloadReviewDrag.pointerId === event.pointerId) {
                    endDownloadReviewDrag();
                }
            });
        }

        if (reviewModal) {
            reviewModal.addEventListener("click", function (event) {
                if (event.target === reviewModal) {
                    closeDownloadReview();
                }
            });
        }

        if (closeReview) {
            closeReview.addEventListener("click", function () {
                closeDownloadReview();
            });
        }

        if (cancelReview) {
            cancelReview.addEventListener("click", function () {
                closeDownloadReview();
            });
        }

        if (confirmReview) {
            confirmReview.addEventListener("click", function () {
                var downloadType = reviewModal ? reviewModal.dataset.downloadType : getDownloadType();
                var songIds = downloadReviewIds.slice();

                selected_songs = songIds.slice();
                if (!shouldZipDownload(downloadType, songIds)) {
                    closeDownloadReview();
                }
                runDownload(songIds, downloadType);
            });
        }

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && reviewModal && !reviewModal.hidden) {
                closeDownloadReview();
            }
        });

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
