const { shell, BrowserWindow } = require("electron");
const path = require("path");

function getMenuTemplate(win, createNewWindow, createIndividualStockWindow) {
  return [
    ...(process.platform === "darwin"
      ? [{ role: "appMenu" }]
      : []),
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "close" },
      ],
    },
    {
      label: "Add investment",
      click: createNewWindow,
    },
    {
      label: "Holdings",
      click: () => createNewWindow("holdings.html"),
    },
    {
      label: "Individual Stock",
      click: createIndividualStockWindow,
    },
    {
      label: "Console",
      click: () => createNewWindow("console.html"),
    },
    {
      label: "Statistics",
      click: () => createNewWindow("statistics.html"),
    },
    {
      label: "Cumulative Holdings",
      click: () => createNewWindow("consolidate.html"),
    },
    {
      label: "Playground",
      click: () => createNewWindow("playground.html"),
    },
    {
      label: "About",
      click: async () => {
        await shell.openExternal("https://gsolanki.vercel.app/");
      },
    },
  ];
}

module.exports = { getMenuTemplate };
