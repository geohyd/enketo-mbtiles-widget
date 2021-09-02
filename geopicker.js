/*
 * Antea Group.
 * 
 */

import Geopicker from '../../node_modules/enketo-core/src/widget/geo/geopicker';
import $ from 'jquery';
import "./leaflet.mbtiles";
import L from 'leaflet';
import scriptjs from 'scriptjs';

/** 
 * We override the initial Geopicker Widget 
 * And adding the mbtiles support on Leaflet.
 * Mbtiles files are stored in the indexedDB for the offline mode.
 * and the mbtile is automaticly load when you refresh the page.
 *
 * Know limitations :
 * - geocoder reset the map and delete mbtiles
 * - Not test with used in conjunction with other appearances
 * - Not test on Grid theme
*/
export default class GeopickerMbTiles extends Geopicker {

    //////////////////////////// Private methods //////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////////
    __getQuestionId() {
        var formId = $('form')[0].id;
        return $(this.question).find("input[name*='" + formId + "']").prop("name")
    }

    __removeMBLayer() {
        var self = this;
        // Remove from map
        self.map.removeLayer(self.mbLayer);
        // Init the transaction
        var tx = self.db.transaction("mbtiles", "readwrite");
        var store = tx.objectStore("mbtiles");
        // Execute the delete transaction
        store.delete(self.idQuestion); // id based on the question
    }

    __addMbTiles(files, self) {
        // Remove mbtiles files if already exist
        typeof self.mbLayer !== "undefined" ? self.__removeMBLayer() : null;
        if (!self.icountCheckMap) {
            self.icountCheckMap = 0;
        }
        self.icountCheckMap++;

        // Only if map exist
        if (typeof self.map !== "undefined") {
            let tmppath = URL.createObjectURL(files[0]);
            self.mbLayer = L.tileLayer.mbTiles(tmppath).addTo(self.map);
            self.mbLayer.bringToFront();
            // Loaded or Error
            self.mbLayer.on('databaseloaded', function (ev) {
                // Init the transaction
                var tx = self.db.transaction("mbtiles", "readwrite");
                var store = tx.objectStore("mbtiles");
                // Add the blob path
                store.put({path: files, mbId: self.idQuestion});
                // Remove loader on complete
                tx.oncomplete = function() {
                    $(self.question).find('.loader').css('display', "none");
                };
            });
            // Callback on database error
            self.mbLayer.on('databaseerror', function (ev) {
                console.info('MBTiles DB error', ev);
                $(self.question).find('.loader').css('display', "none");
            });
        } else {
            // Sometimes, self.map is not yet init. We re-launch the __addMbTiles until is init.
			// With a max re-launch
			// Todo : Need to change this
            if (self.icountCheckMap < 10) {
                setTimeout(function() {
                    self.__addMbTiles(files, self)
                }, 250);
            } else {
                return false;
            }
        }
    }

    __initContent () {
        var self = this;
        // Create html elements
        let mbtilesdiv = document.createElement("div");
        mbtilesdiv.setAttribute("class", "mbtilesdiv");
        let trash = document.createElement("button");
        trash.setAttribute("class", "fa fa-trash");
        let filechooser = document.createElement("input");
        filechooser.setAttribute("type", "file");
        filechooser.setAttribute("accept", ".mbtiles");
        filechooser.setAttribute("name", "mbtiles");

        // Listeners input and trash
        filechooser.addEventListener('change', function(event) {
            $(self.question).find('.loader').css('display', "block");
            self.__addMbTiles(event.target.files, self);
        })
        trash.onclick = function () {
            typeof self.mbLayer !== "undefined" ? self.__removeMBLayer() : null;
            filechooser.value = "";
        };

        // Append html elements
        mbtilesdiv.appendChild(filechooser);
        mbtilesdiv.appendChild(trash);
        $(self.question).find("div.map-canvas-wrapper")[0].appendChild(mbtilesdiv);
    }
    ///////////////////////////////////////////////////////////////////////////////

    __onLibIsLoad() {
        var self = this;
        // Get id question
        self.idQuestion = self.__getQuestionId();
        // Add loader element
        $(self.question).find(".map-canvas").append("<div class='loader'></div>")

        // Connexion to the indexedDB (TODO : maybe change the dbname for match with Enketo ?)
        var request = window.indexedDB.open("enketoMbtiles", 2);
        request.onupgradeneeded = function(e) {
            // The database did not previously exist, so create object stores and indexes.
            self.db = e.target.result;
            self.db.objectStoreNames.contains( "mbtiles" ) || self.db.createObjectStore( "mbtiles", { keyPath: "mbId"} );
        };

        request.onsuccess = function() {
            // Access to the DB
            self.db = request.result;
            var tx = self.db.transaction("mbtiles", "readonly");
            var store = tx.objectStore("mbtiles");
            var dataRQ = store.get(self.idQuestion); // id based on the question
            dataRQ.onsuccess = function() {
                if (dataRQ.result !== undefined) {
                    console.info("Mbtiles", dataRQ.result);
                    $(self.question).find('.loader').css('display', "block");
                    // Update input file
                    $(self.question).find('input[name="mbtiles"]').prop('files', dataRQ.result.path)
                    self.__addMbTiles(dataRQ.result.path, self);
                } else {
                    //console.info("No such mbtiles");
                }
            };
        };

        // Initialization of the widget
        self.__initContent();
    }
    
    _init() {
        // Initilialization
        super._init();
        var self = this;
        // Prepare indexedDB only if appearance is "mbtiles" and the question has a map-canvas class
        if (this._getProps().appearances.includes("mbtiles") && $(self.question).find(".map-canvas")) {
            // Find better solution to import sql.js, maybe with import or require
            scriptjs('https://unpkg.com/sql.js@0.3.2/js/sql.js', function () {
                self.__onLibIsLoad();
            })
        }
    }
}
