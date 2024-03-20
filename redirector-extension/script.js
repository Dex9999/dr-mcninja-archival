chrome.webRequest.onBeforeSendHeaders.addListener(
    function(details) {
      if (details.url.includes("drmcninja.com")) {
        var redirectUrl = details.url.replace("drmcninja.com", "drmcninja.vercel.app");
        return { redirectUrl: redirectUrl };
      }
    },

    {
      urls: ["*://*.drmcninja.com/*"], 
      types: ["main_frame"] 
    },

  );