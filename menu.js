const { shell, BrowserWindow } = require("electron");
const path = require("path");

function getMenuTemplate(win, createNewWindow, createIndividualStockWindow) {
  return [
    {
      label: "Investment",
      submenu: [
        {
          label: "Add Investment",
          click: () => createNewWindow("add.html")
        },
        {
          label: "Holdings",
          click: () => createNewWindow("holdings.html")
        },
        {
          label: "Cumulative Holdings",
          click: () => createNewWindow("consolidate.html")
        }
      ]
    },
    {
      label: "Analysis",
      submenu: [
        {
          label: "Individual Stock",
          click: createIndividualStockWindow
        },
        {
          label: "Statistics",
          click: () => createNewWindow("statistics.html")
        }
      ]
    },
    {
      label: "Tools",
      submenu: [
        {
          label: "Console",
          click: () => createNewWindow("console.html")
        },
        {
          label: "Playground",
          click: () => createNewWindow("playground.html")
        }
      ]
    },
    {
      label: "About",
      click: async () => {
        await shell.openExternal("https://gsolanki.vercel.app/");
      }
    }
  ];
}

module.exports = { getMenuTemplate };
