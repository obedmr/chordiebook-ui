var selected_songs = [];

(function () {
    "use strict";

    var CATALOG_URLS = ["data/data.json", "data.json", "data/songs.json"];
    var DOWNLOAD_TYPES = ["chords", "lyrics", "openlp", "chordpro"];
    var PDF_JOINER_URL = "https://utils.obedmr.com/urls/mergePDFs?";
    var LANGUAGE_STORAGE_KEY = "chordiebook.language";
    var currentLanguage = "en";
    var catalogSongs = [];
    var tableInitialized = false;
    var TRANSLATIONS = {
        en: {
            authors: "Authors",
            catalogError: "Unable to load the song catalog. Tried: {paths}.",
            catalogLoaded: "{count} songs loaded.",
            chords: "Chords",
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
            openMany: "Are you sure that you want to open {count} documents?",
            searchLabel: "Search songs",
            searchPlaceholder: "Search by song name...",
            selected: "selected",
            themes: "Themes"
        },
        es: {
            authors: "Autores",
            catalogError: "No se pudo cargar el catálogo de canciones. Se intentó: {paths}.",
            catalogLoaded: "{count} canciones cargadas.",
            chords: "Acordes",
            downloadSelected: "Descargar seleccionadas",
            eyebrow: "Biblioteca de canciones",
            formatChords: "PDF acordes",
            formatLyrics: "PDF letras",
            heroDescription: "Busca, selecciona y descarga canciones en el formato que tu equipo necesita.",
            key: "Tono",
            loadingCatalog: "Cargando catálogo...",
            lyrics: "Letras",
            name: "Nombre",
            noSelection: "Selecciona al menos una canción para descargar.",
            openMany: "¿Seguro que quieres abrir {count} documentos?",
            searchLabel: "Buscar canciones",
            searchPlaceholder: "Buscar por nombre...",
            selected: "seleccionadas",
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
        return (TRANSLATIONS[currentLanguage] && TRANSLATIONS[currentLanguage][key]) || TRANSLATIONS.en[key] || "";
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

    function localizeTableHeaders() {
        var headers = {
            2: "name",
            3: "key",
            4: "themes",
            5: "authors",
            6: "chords",
            7: "lyrics"
        };

        Object.keys(headers).forEach(function (column) {
            Array.prototype.forEach.call(document.querySelectorAll("thead th:nth-child(" + column + ")"), function (header) {
                var target = header.querySelector(".th-inner") || header;
                target.textContent = translate(headers[column]);
            });
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
        window.setTimeout(localizeTableHeaders, 0);
    }

    function getTable() {
        return document.getElementById("myTable");
    }

    function getRows() {
        var table = getTable();
        return table ? Array.prototype.slice.call(table.querySelectorAll("tbody tr")) : [];
    }

    function normalizeText(value) {
        return (value || "").toString().trim().toUpperCase();
    }

    function escapeHTML(value) {
        return (value || "").toString().replace(/[&<>"']/g, function (character) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;"
            }[character];
        });
    }

    function escapeAttribute(value) {
        return escapeHTML(value).replace(/`/g, "&#96;");
    }

    function getSongURLs(row) {
        if (row && row.urls) {
            return row.urls;
        }

        return DOWNLOAD_TYPES.reduce(function (urls, type) {
            urls[type] = row && row[type] ? row[type] : "";
            return urls;
        }, {});
    }

    function getSongFromRow(row) {
        var urls = getSongURLs(row);
        return DOWNLOAD_TYPES.reduce(function (song, type) {
            song[type] = urls[type] || "";
            return song;
        }, {});
    }

    function findSongIndex(song) {
        return selected_songs.findIndex(function (selectedSong) {
            return selectedSong.chords === song.chords;
        });
    }

    function updateSelectionCount() {
        var counter = document.getElementById("selectionCount");
        if (counter) {
            counter.textContent = selected_songs.length.toString();
        }
    }

    function addSelectedSong(row) {
        var song = getSongFromRow(row);
        if (song.chords && findSongIndex(song) === -1) {
            selected_songs.push(song);
        }
        updateSelectionCount();
    }

    function removeSelectedSong(row) {
        var song = getSongFromRow(row);
        if (!song.chords) {
            return;
        }

        selected_songs = selected_songs.filter(function (selectedSong) {
            return selectedSong.chords !== song.chords;
        });
        updateSelectionCount();
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

    function makeLink(url, label, i18nKey) {
        return [
            "<a href=\"",
            escapeAttribute(url),
            "\" target=\"_blank\" rel=\"noopener\"",
            i18nKey ? " data-i18n=\"" + escapeAttribute(i18nKey) + "\"" : "",
            ">",
            escapeHTML(label),
            "</a>"
        ].join("");
    }

    function songToRow(song) {
        var urls = song.urls || {};
        var themes = Array.isArray(song.themes) ? song.themes.join(", ") : "";
        var authors = Array.isArray(song.authors) ? song.authors.join(", ") : "";

        return {
            state: false,
            id: song.id,
            name: escapeHTML(song.name),
            key: escapeHTML(song.key),
            themes: escapeHTML(themes),
            authors: escapeHTML(authors),
            chords: makeLink(urls.chords, translate("chords"), "chords"),
            lyrics: makeLink(urls.lyrics, translate("lyrics"), "lyrics"),
            openlp: makeLink(urls.openlp, "OpenLP"),
            chordpro: makeLink(urls.chordpro, "ChordPro"),
            urls: urls
        };
    }

    function renderSongs(songs) {
        var $table = $("#myTable");
        var rows = songs.map(songToRow);

        selected_songs = [];
        updateSelectionCount();

        if (tableInitialized) {
            $table.bootstrapTable("load", rows);
        } else {
            $table.bootstrapTable({
                data: rows
            });
            tableInitialized = true;
        }

        applyLocalization(currentLanguage, false);
        myFunction();
    }

    function myFunction() {
        var input = document.getElementById("myInput");
        var filter = normalizeText(input ? input.value : "");

        getRows().forEach(function (row) {
            if (!row.dataset.searchText) {
                row.dataset.searchText = normalizeText(row.textContent);
            }

            row.style.display = !filter || row.dataset.searchText.indexOf(filter) > -1 ? "" : "none";
        });
    }

    function fetchCatalog(urls) {
        var pending = urls.slice();
        var failures = [];

        function tryNext() {
            var url = pending.shift();
            if (!url) {
                throw new Error("Catalog not found. Tried: " + failures.join(", "));
            }

            return fetch(url, { cache: "no-cache" })
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
                renderSongs(catalogSongs);
                setCatalogStatus("catalogLoaded", { count: catalogSongs.length });
            })
            .catch(function (error) {
                setCatalogStatus("catalogError", { paths: CATALOG_URLS.join(", ") }, true);
                window.console.error("Unable to load catalog", error);
            });
    }

    function download() {
        var downloadType = getDownloadType();
        var selectedURLs = selected_songs.map(function (song) {
            return song[downloadType];
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

    window.setLanguage = applyLocalization;
    window.myFunction = myFunction;
    window.download = download;

    $(function () {
        var $table = $("#myTable");

        applyLocalization(getInitialLanguage(), false);

        $table.on("check.bs.table", function (event, row) {
            addSelectedSong(row);
        });

        $table.on("uncheck.bs.table", function (event, row) {
            removeSelectedSong(row);
        });

        $table.on("check-all.bs.table", function (event, rows) {
            rows.forEach(addSelectedSong);
        });

        $table.on("uncheck-all.bs.table", function (event, rows) {
            rows.forEach(removeSelectedSong);
        });

        $("#myInput").on("input", myFunction);
        $("[data-language]").on("click", function () {
            applyLocalization(this.getAttribute("data-language"), true);
        });

        loadCatalog();
        updateSelectionCount();
    });
}());
