self.__BUILD_MANIFEST = {
  "__rewrites": {
    "afterFiles": [
      {
        "source": "/ZendoCoin-Polygon_Mainnet.zip",
        "destination": "/api/download?file=ZendoCoin-Polygon_Mainnet.zip"
      },
      {
        "source": "/ZendoL-1_App.zip",
        "destination": "/api/download?file=ZendoL-1_App.zip"
      },
      {
        "source": "/ZendoDeployL1.zip",
        "destination": "/api/download?file=ZendoDeployL1.zip"
      },
      {
        "source": "/ZendoL-1Ready.zip",
        "destination": "/api/download?file=ZendoL-1_App.zip"
      },
      {
        "source": "/zendo-history/:pass/zendo-history.json",
        "destination": "/api/wallet/history?format=json&pass=:pass"
      },
      {
        "source": "/zendo-history/:pass/zendo-history.csv",
        "destination": "/api/wallet/history?format=csv&pass=:pass"
      }
    ],
    "beforeFiles": [],
    "fallback": []
  },
  "sortedPages": [
    "/_app",
    "/_error"
  ]
};self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB()