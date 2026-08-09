import { beforeAll, describe, expect, it } from 'vitest';

import { initializeMainI18n } from '../../../src/main/i18n/main-i18n';
import {
  createCloseUnsavedDialogOptions,
  createNewProjectDialogOptions,
  createOpenProjectDialogOptions,
} from '../../../src/main/i18n/native-dialog-options';

describe('localized native dialog options', () => {
  beforeAll(async () => initializeMainI18n());

  it('builds the complete unsaved dialog from the current language', () => {
    expect(createCloseUnsavedDialogOptions('zh-CN', '第一章')).toMatchObject({
      buttons: ['取消', '不保存', '保存并关闭'],
      detail: '如果不保存，你在当前会话中的修改将会丢失。',
      message: '要保存对“第一章”的修改吗？',
      title: '未保存的修改',
    });
  });

  it('builds the complete project picker from the current language', () => {
    expect(createOpenProjectDialogOptions('en', '/books')).toEqual({
      buttonLabel: 'Open project',
      defaultPath: '/books',
      message: 'Choose a folder to use as a Driftfield project',
      properties: ['openDirectory'],
      title: 'Open local project',
    });
  });

  it('builds a project creation picker that can make a folder', () => {
    expect(createNewProjectDialogOptions('zh-CN', '/books')).toEqual({
      buttonLabel: '新建项目',
      defaultPath: '/books',
      message: '选择一个空文件夹，Driftfield 将在其中创建项目结构',
      properties: ['openDirectory', 'createDirectory'],
      title: '新建本地项目',
    });
  });
});
