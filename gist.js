define(function(require, exports, module) {
    main.consumes = [
        "ace", "commands", "Dialog", "dialog.confirm", "dialog.error", "http",
        "Plugin", "settings", "ui"
    ];
    main.provides = ["harvard.cs50.gist"];
    return main;

    function main(options, imports, register) {
        var aceHandler = imports.ace;
        var confirm = imports["dialog.confirm"].show;
        var commands = imports.commands;
        var Dialog = imports["Dialog"];
        var http = imports.http;
        var error = imports["dialog.error"].show;
        var Plugin = imports.Plugin;
        var settings = imports.settings;
        var ui = imports.ui;

        // https://lodash.com/docs
        var _ = require("lodash");
        var basename = require("path").basename;

        // dialog for rendering gist URL
        var dialog = null;
        var urlbox = null;

        // CSS classes for icons
        var icons = null;

        // load facebook sdk, if not loaded
        var fbsdk = null;

        // instantiate plugin
        var plugin = new Plugin("CS50", main.consumes);

        // used to detect when selection is complete
        var keyUp = true;
        var mouseUp = true;

        // whether the plugin has been loaded
        var loaded = false;

        /**
         * trims the minimum number of spaces from the start of every line
         * in the argument
         *
         * @param {string} code code from which leading spaces to be trimmed
         * @return {string} code with first n spaces trimmed from all lines
         */
        function trimSpaces(code) {
            if (!_.isString(code))
                return false;

            // split code into array of lines
            var lines = code.split("\n");
            var numOfLines = lines.length;
            var n = 0;

            // check if all lines start with >= n spaces, and calculate n
            for (var i = 0; i < numOfLines; i++) {

                // return if at least one line doesn't have leading spaces
                if (lines[i].charAt(0) !== ' ')
                    return code;

                var j = 1;
                var length = lines[i].length;
                var spaces = 1;

                // count leading spaces
                while (j < length && lines[i].charAt(j++) === ' ')
                    spaces++;

                if (n === 0 || spaces < n)
                    n = spaces;
            }

            // trim first n spaces
            for (var i = 0, length = lines.length; i < length; i++)
                lines[i] = lines[i].substring(n);

            return lines.join("\n");
        }

        /**
         * Associates a Gist instance with an ace instance
         *
         * @param {editor} editor an ace editor
         */
        function Gist(editor) {

            // ace instance
            var ace = editor.ace;

            // current ace session
            var currentSession = null;

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
             * @param {string} filename gist file name (including extension)
             * @param {string} code code to be shared
             */
            function createGist(filename, code) {
                if (!_.isString(filename) || !_.isString(code)
                    || code.length === 0)
                    return;

                // show loading icon
                currentSession.addGutterDecoration(
                    currentSession.row, icons.loading
                );

                // request data
                var requestData = {
                  description: filename + " - shared from CS50 IDE",
                  files: {},
                  public: false
                };

                // providing filename with extension enables syntax highlighting
                requestData.files[filename] = {content: code};

                // initiate request
                http.request(
                    "https://api.github.com/gists", {
                        method: "POST",
                        body: requestData,
                        contentType: "application/json"
                    }, function(err, data) {

                        // hide loading icon
                        currentSession.removeGutterDecoration(
                            currentSession.row, icons.loading
                        );

                        // handle errors
                        if (err) {
                            error("Error creating gist.");
                            throw err;
                        }

                        // show URL dialog
                        dialog.show();

                        // update value of URL box
                        urlbox.value = data.html_url;

                        // select URL (allows easy copying)
                        urlbox.focus();
                    }
                );
            }

            /**
             * @return filename of current file or false on name-getting failure
             */
            function getFileName() {
                if (!_.isObject(editor) || !_.isObject(editor.activeDocument)
                    || !_.isObject(editor.activeDocument.tab)
                    || !_.isString(editor.activeDocument.tab.path))
                    return false;

                return basename(editor.activeDocument.tab.path);
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
                iconClass = skin.indexOf("light") !== -1
                    ? icons.light
                    : icons.dark;

                // remove old icon (if any)
                if (_.isNumber(currentSession.row)) {
                    currentSession.removeGutterDecoration(
                        currentSession.row, icons.dark
                    );
                    currentSession.removeGutterDecoration(
                        currentSession.row, icons.light
                    );
                }

                // erase icon's current row
                currentSession.row = null;

                // ensure something is selected
                if (range.isEmpty())
                    return;

                // get icon's new row
                currentSession.row = selection.getSelectionLead().row;

                // show icon only when selection complete
                if (keyUp && mouseUp)
                    currentSession.addGutterDecoration(
                        currentSession.row, iconClass
                    );
            }

            // detect when selection is complete
            ace.container.onkeydown = function(e) {

                // consider selection incomplete while shift key is down
                if (e.shiftKey) {
                    keyUp = false;
                    return;
                }

                updateIcon();
            };
            ace.container.onkeyup = function(e) {

                // consider selection complete only when shift key is up
                if (!e.shiftKey) {
                    keyUp = true;
                    updateIcon();
                }
            }
            ace.container.onmousedown = function() {
                mouseUp = false;
                updateIcon();
            };

            // handle dragging mouse out of viewport while selecting
            document.addEventListener("mouseup", function(){
                mouseUp = true;
                updateIcon();
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

                // handle clicking on share icon
                if (region == "markers"
                    && clickedRow === currentSession.row)  {

                    // temporarily prevent breakpoint toggling
                    e.stop();

                    // show confirmation message
                    confirm(
                        "Create Gist",
                        "",
                        "Are you sure you want to share the highlighted lines " +
                        "of code? Do be reasonable, per CS50's policy on " +
                        "academic honesty.",

                        // ok
                        function() {

                            // create new gist from selected text
                            createGist(
                                getFileName(),
                                trimSpaces(e.editor.getSelectedText())
                            );
                        },

                        // cancel
                        function() {}
                    );
                }
            }, true);

            // update sharing icon whenever theme changes
            settings.on("user/general/@skin", function(value) {
                updateIcon();
            }, plugin);
        }

        plugin.on("load", function() {
            if (loaded === true)
                return;

            loaded = true;
            dialog = new Dialog("CS50", main.consumes, {
                // dialog plugin name
                name: "gist-success-dialog",
                title: "Created Gist",
                allowClose: true,

                // prevent interacting with IDE
                modal: true,

                // bar at the bottom of dialog
                elements: [

                    // "copy" hint
                    {
                        type: "label",
                        caption: "Press " +
                            (commands.platform === "mac" ? "⌘" : "CTRL") +
                            "-C to copy"
                    },

                    // horizontal gap
                    { type: "filler" },

                    // "Share to Facebook" button
                    {
                        name: "shareToFb",
                        type: "button",
                        caption: "Share to Facebook",
                        onclick: function() {
                            if (!_.isObject(FB) || !_.isObject(urlbox)
                                || !_.isString(urlbox.value))
                                return;

                            // open share dialog
                            FB.ui({
                                method: "share",
                                href: urlbox.value
                            }, function(response){});
                        }
                    },

                    // "Got it!" button
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
                urlbox.onblur = urlbox.focus;

                // select URL (allows easy copying)
                urlbox.onfocus = urlbox.select;

                // open gist URL on click
                urlbox.onclick = function() {
                    if (!_.isString(this.value))
                        return;

                    window.open(this.value, "_blank");
                };

                // make "Share to Facebook" button blue
                dialog.getElement("shareToFb", function(e) {
                    var btn = e.$ext;
                    btn.style.backgroundColor = "#3b5998";
                    btn.style.backgroundImage = "initial";

                    // remove border
                    btn.removeChild(e.$ext.childNodes[3]);
                });
            });

            // sharing icon CSS classes
            icons = {
                dark: "cs50-gist-dark",
                light: "cs50-gist-light",
                loading: "cs50-gist-loading"
            };

            // CSS for sharing icon once
            ui.insertCss(
                require("text!./style.css"),
                options.staticPrefix,
                plugin
            );

            // load facebook sdk
            fbsdk = document.createElement("script");
            fbsdk.setAttribute("class", "fbsdk");
            fbsdk.type = "text/javascript";
            fbsdk.appendChild(
                document.createTextNode(require("text!./fbsdk.js"))
            );
            document.body.appendChild(fbsdk);

            // create an instance of Gist per ace instance
            aceHandler.on("create", function(e) {
                new Gist(e.editor);
            });
        });

        plugin.on("unload", function() {
            document.body.removeChild(fbsdk);
            dialog = null;
            urlbox = null;
            icons = null;
            fbsdk = null;
            keyUp = true;
            mouseUp = true;
            loaded = false;
        });
        plugin.freezePublicAPI({});
        register(null, {
            "harvard.cs50.gist": plugin
        });
    }
});
