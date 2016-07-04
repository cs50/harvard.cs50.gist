define(function(require, exports, module) {
    main.consumes = [
        "ace", "Dialog", "dialog.confirm", "dialog.error", "Plugin",
        "settings" , "ui"
    ];
    main.provides = ["harvard.cs50.gist"];
    return main;

    function main(options, imports, register) {
        var aceHandler = imports.ace;
        var confirm = imports["dialog.confirm"].show;
        var Dialog = imports["Dialog"];
        var error = imports["dialog.error"].show;
        var Plugin = imports.Plugin;
        var settings = imports.settings;
        var ui = imports.ui;

        // create instance of Gist for each instance of ace
        aceHandler.on("create", function(e) {
            new Gist("CS50", main.consumes, e.editor);
        });

        /**
         * Gist factory.
         */
        function Gist(developer, dependencies, editor) {
            // https://lodash.com/docs
            var _ = require("lodash");
            var basename = require("path").basename;

            // ace instance
            var ace = editor.ace;
            // current ace session
            var currentSession = null;
            // dialog for rendering gist URL
            var dialog = null;
            var urlbox = null;
            // CSS classes for icons
            var icons = {
                dark: {
                    class: "cs50-gist-dark",
                    skins: ["dark", "dark-gray", "flat-dark"]
                },
                light: {
                    class: "cs50-gist-light",
                    skins: ["light", "light-gray", "flat-light"]
                },
                loading: {
                    class: "cs50-gist-loading"
                }
            };

            // instantiate plugin
            var plugin = new Plugin(developer, main.consumes);

            /**
             * Sets up listener for selection change in current ace session,
             * which it handles by calling updateIcon.
             */
            function changeSession() {
                if (!_.isObject(ace))
                    return;

                // update current ace session
                currentSession = ace.getSession();
                // listen for selection change
                ace.getSelection().on("changeSelection", updateIcon);
                updateIcon();
            }

            /**
             * creates a gist.
             *
             * @param {string} filename the name of gist file (including extension)
             * @param {string} code code to be shared
             */
            function createGist(filename, code) {
                if (!_.isString(filename) || !_.isString(code) || code === "") {
                    return;
                }

                // set up AJAX request
                var request = new XMLHttpRequest();
                // handle response
                request.onreadystatechange = function() {
                    if (request.readyState === XMLHttpRequest.DONE) {
                        // handle successful creation of gist
                        if (request.status === 201) {
                            // gist URL
                            var url = JSON.parse(request.responseText).html_url;
                            // show URL dialog
                            dialog.show();
                            // update value of URL box
                            urlbox.value = url;
                            // select URL (allows easy copying)
                            urlbox.focus();
                        }
                        else {
                            // handle creation errors
                            error("Error creating gist");
                        }

                        // hide loading icon
                        currentSession.removeGutterDecoration(currentSession.row, icons.loading.class);
                    }
                };

                // request method & API endpoint
                request.open('POST', "https://api.github.com/gists");

                // request headers
                request.setRequestHeader("Content-Type", "application/json");

                // request data
                var requestData = {
                  "description": "shared from CS50 IDE <https://cs50.io>",
                  "files": {},
                  "public": false
                };
                // providing filename with proper extension enables syntax highlighting
                requestData.files[filename] = {"content": code};
                // send request
                request.send(JSON.stringify(requestData));
                // show loading icon
                currentSession.addGutterDecoration(currentSession.row, icons.loading.class);
            }

            /**
             * @return filename of current file or false on name-getting failure.
             */
            function getFileName() {
                var activeDoc = editor.activeDocument;
                var tab = activeDoc.tab;
                var path = tab.path;
                if (!_.isObject(editor) || !_.isObject(activeDoc) || !_.isObject(tab) || !_.isString(path)) {
                    return false;
                }

                return basename(path);
            }

            /**
             * Updates visibility of sharing icon and sharing confirmation
             * status based on whether something is selected.
             */
            function updateIcon() {
                if (!_.isObject(ace) || !_.isObject(currentSession))
                    return;

                // selection object
                var selection = ace.getSelection();
                // selection range
                var range = selection.getRange();

                // current skin
                var skin = settings.get("user/general/@skin");
                // sharing icon class
                var iconClass;
                // pick dark or light icon based on skin
                if (icons.dark.skins.indexOf(skin) !== -1) {
                    iconClass = icons.dark.class;
                }
                else {
                    iconClass = icons.light.class;
                }

                // remove old icon (if any)
                if (_.isNumber(currentSession.row)) {
                    //currentSession.removeGutterDecoration(currentSession.row, iconClass);
                    currentSession.removeGutterDecoration(currentSession.row, icons.dark.class);
                    currentSession.removeGutterDecoration(currentSession.row, icons.light.class);
                }

                // erase icon's current row & reset confirm (e.g., when nothing is selected)
                currentSession.row = null;
                currentSession.confirm = false;

                // ensure something is selected
                if (range.isEmpty()) {
                    return;
                }

                // get icon's new row
                currentSession.row = selection.getSelectionLead().row;
                // show new icon
                currentSession.addGutterDecoration(currentSession.row, iconClass);

                // calculate ratio of selected lines to all lines
                var lines = range.end.row - range.start.row + 1;
                var ratio = lines / currentSession.getDocument().getLength();
                // confirm if > 50%
                currentSession.confirm = ratio > 0.5;
            }

            plugin.on("load", function() {
                // dialog box to render gist URL (on success)
                dialog = new Dialog("CS50", main.consumes, {
                    // dialog plugin name
                    name: "gist-success-dialog",
                    title: "Successfully Shared Code",
                    allowClose: true,
                    // prevent interacting with IDE
                    modal: true,
                    // bar at the bottom of dialog
                    elements: [
                        // "copy" hint
                        {
                            type: "label",
                            caption: "Press CTRL-C to copy"
                        },
                        // horizontal gap
                        {type: "filler"},
                        // "Got it" button
                        {
                            type: "button",
                            caption: "Got it!",
                            color: "green",
                            onclick: function () {
                                dialog.hide();
                            }
                        }
                    ]
                });

                // draw gist URL dialog
                dialog.on("draw", function(e) {
                    // dialog body
                    e.html.innerHTML = '<div>' +
                        '<h3>Your code was shared successfully!</h3>' +
                        '<input class="gist-url" type="url" readonly>' +
                        '</div>';

                    // gist URL box
                    urlbox = e.html.querySelector("input");

                    // prevent blurring gist URL box
                    urlbox.onblur = function() {
                        this.focus();
                    };
                    // select URL (allows easy copying)
                    urlbox.onfocus = function() {
                        this.select();
                    }
                    // open gist URL on click
                    urlbox.onclick = function() {
                        if (!_.isString(this.value))
                            return;

                        window.open(this.value, "_blank");
                    }
                });

                // set up text-selection listener for current ace session
                changeSession();
                // set up text-selection listeners for new ace sessions
                ace.on("changeSession", changeSession);

                // handle mouse clicks on gutter
                ace.on("guttermousedown", function(e) {
                    // get clicked row
                    var clickedRow  = e.getDocumentPosition().row;
                    // get clicked region
                    var region = e.editor.renderer.$gutterLayer.getRegion(e);
                    if (region == "markers" && clickedRow === currentSession.row)  {
                        // temporarily prevent breakpoint toggling, if share icon clicked
                        e.stop();

                        // show confirmation message when necessary
                        if (currentSession.confirm) {
                            confirm(
                                "Confirm Sharing",
                                "Too much code from this file is to be shared",
                                "Are you sure you want to share this many lines of code?",
                                // ok
                                function() {
                                    // create new gist from selected text
                                    createGist(getFileName(), e.editor.getCopyText());
                                },
                                // cancel
                                function() {}
                            );
                        }
                        else {
                            // create new gist from selected text
                            createGist(getFileName(), e.editor.getCopyText());
                        }
                    }
                }, true);

                // CSS for sharing icon
                ui.insertCss(require("text!./style.css"), options.staticPrefix, plugin);

                // update sharing icon whenever theme changes
                settings.on("user/general/@skin", function(value) {
                    updateIcon();
                }, plugin);
            });

            plugin.on("unload", function() {});
            plugin.freezePublicAPI({});
            plugin.load(null, "harvard.cs50.gist");

            return plugin;
        }

        register(null, {
            "harvard.cs50.gist": Gist
        });
    }
});
