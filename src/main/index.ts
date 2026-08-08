import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { IPC_CHANNELS } from '../shared/contracts/ipc-channels';
import type {
  ProjectDocument,
  ProjectTreeNode,
  SelectProjectDirectoryResult,
} from '../shared/contracts/project';

const mainWindows = new Set<BrowserWindow>();
const supportedDocumentExtensions = new Set(['.md', '.markdown', '.mdx']);
const ignoredDirectoryNames = new Set(['.git', 'node_modules']);
const MAX_PROJECT_DOCUMENTS = 500;
const MAX_PROJECT_BYTES = 10 * 1024 * 1024;
const MAX_SCANNED_ENTRIES = 10_000;

interface ProjectScanState {
  bytes: number;
  documents: ProjectDocument[];
  entries: number;
}

const scanProjectDirectory = async (
  projectPath: string,
  relativeDirectory: string,
  state: ProjectScanState,
): Promise<ProjectTreeNode[]> => {
  const absoluteDirectory = path.join(projectPath, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const nodes: ProjectTreeNode[] = [];

  entries.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );

  for (const entry of entries) {
    state.entries += 1;

    if (state.entries > MAX_SCANNED_ENTRIES) {
      throw new Error('Project directory contains too many entries');
    }

    if (entry.isSymbolicLink() || entry.name.startsWith('.')) {
      continue;
    }

    const relativePath = path.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) {
        continue;
      }

      const children = await scanProjectDirectory(
        projectPath,
        relativePath,
        state,
      );

      if (children.length > 0) {
        nodes.push({
          children,
          name: entry.name,
          relativePath,
          type: 'folder',
        });
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();

    if (!supportedDocumentExtensions.has(extension)) {
      continue;
    }

    if (state.documents.length >= MAX_PROJECT_DOCUMENTS) {
      throw new Error('Project contains too many Markdown documents');
    }

    const absolutePath = path.join(projectPath, relativePath);
    const fileStats = await stat(absolutePath);

    if (state.bytes + fileStats.size > MAX_PROJECT_BYTES) {
      throw new Error('Project Markdown documents are too large');
    }

    const markdown = await readFile(absolutePath, 'utf8');
    const document: ProjectDocument = {
      id: relativePath,
      markdown,
      name: path.basename(entry.name, extension),
      relativePath,
    };

    state.bytes += fileStats.size;
    state.documents.push(document);
    nodes.push({
      documentId: document.id,
      name: document.name,
      relativePath,
      type: 'file',
    });
  }

  return nodes;
};

const registerIpcHandlers = (): void => {
  ipcMain.handle(
    IPC_CHANNELS.selectProjectDirectory,
    async (event): Promise<SelectProjectDirectoryResult> => {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);

      if (
        senderWindow === null ||
        !mainWindows.has(senderWindow) ||
        event.senderFrame !== event.sender.mainFrame
      ) {
        throw new Error('Unauthorized project directory request');
      }

      const result = await dialog.showOpenDialog(senderWindow, {
        buttonLabel: '打开项目',
        defaultPath: app.getPath('documents'),
        message: '选择一个文件夹作为 Driftfield 项目目录',
        properties: ['openDirectory'],
        title: '打开本地项目',
      });

      const selectedPath = result.filePaths[0];

      if (result.canceled || selectedPath === undefined) {
        return null;
      }

      const directoryPath = await realpath(selectedPath);
      const directoryStats = await stat(directoryPath);

      if (!directoryStats.isDirectory()) {
        throw new Error('Selected project path is not a directory');
      }

      const state: ProjectScanState = { bytes: 0, documents: [], entries: 0 };
      const tree = await scanProjectDirectory(directoryPath, '', state);

      return {
        directory: {
          name: path.basename(directoryPath) || directoryPath,
          path: directoryPath,
        },
        documents: state.documents,
        tree,
      };
    },
  );
};

const createMainWindow = (): void => {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#f5f2eb',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  mainWindows.add(window);
  window.once('closed', () => mainWindows.delete(window));

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(
      path.join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      ),
    );
  }

  if (!app.isPackaged) {
    window.webContents.openDevTools({ mode: 'detach' });
  }
};

void app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
