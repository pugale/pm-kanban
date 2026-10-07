// Punto di ingresso di PM-Kanban: schermata di avvio, finestra principale, servizi

import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { registraIpc } from "./ipc";
import { avviaOsservatore, fermaOsservatore } from "./storage/osservatore";

const NOME_APP = "PM-Kanban";
const URL_SVILUPPO = process.env.VITE_DEV_SERVER_URL;
/** Cartella "resources" del progetto (icona e schermata di avvio) */
const RISORSE = path.join(__dirname, "..", "..", "resources");
const ICONA = path.join(RISORSE, process.platform === "win32" ? "icon.ico" : "icon.png");
/** Tempo minimo di visualizzazione della schermata di avvio, per non farla "lampeggiare" */
const DURATA_MINIMA_AVVIO_MS = 1800;
/** Se la finestra principale non è pronta entro questo tempo, viene comunque mostrata */
const ATTESA_MASSIMA_AVVIO_MS = 15000;

app.setName(NOME_APP);
if (process.platform === "win32") app.setAppUserModelId("it.pmkanban.app"); // icona e nome corretti nella barra di Windows

function creaSchermataAvvio(): BrowserWindow {
  const avvio = new BrowserWindow({
    width: 460,
    height: 320,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#0f6cbd",
    icon: ICONA,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  avvio.once("ready-to-show", () => avvio.show());
  void avvio.loadFile(path.join(RISORSE, "splash.html"), { query: { v: app.getVersion() } });
  return avvio;
}

function creaFinestra(avvio?: BrowserWindow) {
  const inizio = Date.now();
  const finestra = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: NOME_APP,
    icon: ICONA,
    backgroundColor: "#f4f6fa",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true, // l'interfaccia non vede Node: usa solo window.pm
      nodeIntegration: false,
      sandbox: false, // il preload è compilato come modulo CommonJS
    },
  });

  // Mostra la finestra principale e chiude la schermata di avvio (una sola volta)
  let mostrata = false;
  const mostra = () => {
    if (mostrata || finestra.isDestroyed()) return;
    mostrata = true;
    finestra.show();
    if (avvio && !avvio.isDestroyed()) avvio.destroy();
  };
  finestra.once("ready-to-show", () => setTimeout(mostra, Math.max(0, DURATA_MINIMA_AVVIO_MS - (Date.now() - inizio))));
  setTimeout(mostra, ATTESA_MASSIMA_AVVIO_MS);

  // Il titolo resta "PM-Kanban" anche se la pagina ne imposta un altro
  finestra.on("page-title-updated", (e) => e.preventDefault());

  // I collegamenti (SharePoint, Jira, Teams...) si aprono nel browser predefinito
  finestra.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  finestra.webContents.on("will-navigate", (e, url) => {
    if (URL_SVILUPPO && url.startsWith(URL_SVILUPPO)) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  if (URL_SVILUPPO) {
    void finestra.loadURL(URL_SVILUPPO);
    finestra.webContents.openDevTools({ mode: "detach" });
  } else {
    void finestra.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }
}

// Una sola istanza: due app aperte scriverebbero sugli stessi file
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows().find((x) => x.isVisible());
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  app.whenReady().then(async () => {
    const avvio = creaSchermataAvvio(); // compare subito, mentre si preparano i servizi
    registraIpc();
    await avviaOsservatore();
    creaFinestra(avvio);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) creaFinestra();
    });
  });

  app.on("window-all-closed", () => {
    fermaOsservatore();
    if (process.platform !== "darwin") app.quit();
  });
}
