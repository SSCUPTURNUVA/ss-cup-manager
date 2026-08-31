const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");

let localServer = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const distPath = path.join(__dirname, "dist");

    if (!fs.existsSync(distPath)) {
      reject(new Error(`dist klasörü bulunamadı:\n${distPath}`));
      return;
    }

    localServer = http.createServer((req, res) => {
      try {
        let requestPath = decodeURIComponent(
          (req.url || "/").split("?")[0]
        );

        if (requestPath === "/") {
          requestPath = "/index.html";
        }

        let filePath = path.join(distPath, requestPath);

        // Güvenlik: dist dışına çıkılmasını engelle
        const normalizedDist = path.normalize(distPath + path.sep);
        const normalizedFile = path.normalize(filePath);

        if (!normalizedFile.startsWith(normalizedDist)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        // Dosya yoksa React SPA için index.html döndür
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distPath, "index.html");
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType =
          mimeTypes[ext] || "application/octet-stream";

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(500, {
              "Content-Type": "text/plain; charset=utf-8",
            });
            res.end("Dosya okunamadı.");
            return;
          }

          res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": "no-cache",
          });

          res.end(data);
        });
      } catch (err) {
        res.writeHead(500, {
          "Content-Type": "text/plain; charset=utf-8",
        });

        res.end(err?.message || "Sunucu hatası");
      }
    });

    localServer.on("error", reject);

    // Boş port seçsin
    localServer.listen(0, "127.0.0.1", () => {
      const address = localServer.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#071a3d",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "build", "icon.png"),

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Sayfa hazır olunca pencereyi göster
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith("http://127.0.0.1") ||
      url.startsWith("http://localhost")
    ) {
      return { action: "allow" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;

  try {
    if (devUrl) {
      await win.loadURL(devUrl);
    } else {
      const localUrl = await startLocalServer();
      await win.loadURL(localUrl);
    }
  } catch (err) {
    dialog.showErrorBox(
      "S&S CUP Açılış Hatası",
      err?.message || String(err)
    );
  }
}

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (localServer) {
    localServer.close();
    localServer = null;
  }

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