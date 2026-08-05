const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

let localServer = null;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const distPath = path.join(__dirname, "dist");
    const indexPath = path.join(distPath, "index.html");

    if (!fs.existsSync(indexPath)) {
      reject(new Error(`dist/index.html bulunamadı: ${indexPath}`));
      return;
    }

    localServer = http.createServer((req, res) => {
      try {
        const rawUrl = req.url || "/";
        const cleanUrl = decodeURIComponent(rawUrl.split("?")[0]);
        let requestedPath = cleanUrl === "/" ? "/index.html" : cleanUrl;
        let filePath = path.normalize(path.join(distPath, requestedPath));

        if (!filePath.startsWith(path.normalize(distPath))) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = indexPath;
        }

        const extension = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[extension] || "application/octet-stream";

        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        });

        fs.createReadStream(filePath).pipe(res);
      } catch (error) {
        console.error("Yerel sunucu hatası:", error);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Uygulama dosyası yüklenemedi.");
      }
    });

    localServer.once("error", reject);
    localServer.listen(0, "127.0.0.1", () => {
      const address = localServer.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1200,
    minHeight: 750,
    backgroundColor: "#071a3d",
    autoHideMenuBar: true,
    show: false,
    center: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => {
    win.maximize();
    win.show();
    win.focus();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("Sayfa yükleme hatası:", errorCode, errorDescription);
  });

  try {
    const devUrl = process.env.VITE_DEV_SERVER_URL;

    if (devUrl) {
      await win.loadURL(devUrl);
    } else {
      const localUrl = await startLocalServer();
      await win.loadURL(localUrl);
    }
  } catch (error) {
    console.error("Uygulama açılış hatası:", error);
    dialog.showErrorBox(
      "S&S CUP Manager açılamadı",
      error?.message || "Bilinmeyen bir açılış hatası oluştu."
    );
    app.quit();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }
});
