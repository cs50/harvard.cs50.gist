var url = window.location.hostname;
var appId = null;

// determine app id
if (url === "ide.cs50.io")
    appId = "1133070256756921";
else if (url === "ide.c9.io")
    appId = "1798839677015179";

// load facebook sdk
window.fbAsyncInit = function() {
    FB.init({
      appId      : appId,
      xfbml      : true,
      version    : "v2.6"
    });
};

(function(d, s, id){
    var js;
    var fjs = d.getElementsByTagName(s)[0];
    if (d.getElementById(id)) {
        return;
    }
    js = d.createElement(s);
    js.id = id;
    js.src = "//connect.facebook.net/en_US/sdk.js";
    fjs.parentNode.insertBefore(js, fjs);
}(document, "script", "facebook-jssdk"));

