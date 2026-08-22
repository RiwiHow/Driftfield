import { ProjectCatalogRepository } from './project-catalog-repository';
import { ProjectConversationRepository } from './project-conversation-repository';
import { ProjectDatabase } from './project-database';
import { ProjectReconciliationRepository } from './project-reconciliation-repository';
import { ProjectOperationRepository } from './project-operation-repository';
import { ProjectSettingsRepository } from './project-settings-repository';
import { ProjectStoryRepository } from './project-story-repository';
import { ProjectWritingArtifactRepository } from './project-writing-artifact-repository';

export interface ProjectUnitOfWork {
  catalog: ProjectCatalogRepository;
  conversations: ProjectConversationRepository;
  operations: ProjectOperationRepository;
  reconciliation: ProjectReconciliationRepository;
  settings: ProjectSettingsRepository;
  stories: ProjectStoryRepository;
  writingArtifacts: ProjectWritingArtifactRepository;
}

export class ProjectStore {
  private readonly database: ProjectDatabase;
  private readonly unitOfWork: ProjectUnitOfWork;

  constructor(readonly projectDirectory: string) {
    this.database = new ProjectDatabase(projectDirectory);
    this.unitOfWork = {
      catalog: new ProjectCatalogRepository(this.database),
      conversations: new ProjectConversationRepository(this.database),
      operations: new ProjectOperationRepository(this.database),
      reconciliation: new ProjectReconciliationRepository(this.database),
      settings: new ProjectSettingsRepository(this.database),
      stories: new ProjectStoryRepository(this.database),
      writingArtifacts: new ProjectWritingArtifactRepository(this.database),
    };
  }

  read<T>(operation: (unitOfWork: ProjectUnitOfWork) => T): T {
    return operation(this.unitOfWork);
  }

  write<T>(operation: (unitOfWork: ProjectUnitOfWork) => T): T {
    return this.database.transaction(() => operation(this.unitOfWork));
  }

  close(): void {
    this.database.close();
  }
}

export class ProjectStoreRegistry {
  private readonly references = new Map<string, number>();
  private readonly stores = new Map<string, ProjectStore>();

  get(projectDirectory: string): ProjectStore {
    let store = this.stores.get(projectDirectory);
    if (store === undefined) {
      store = new ProjectStore(projectDirectory);
      this.stores.set(projectDirectory, store);
    }
    return store;
  }

  retain(projectDirectory: string): void {
    this.references.set(
      projectDirectory,
      (this.references.get(projectDirectory) ?? 0) + 1,
    );
  }

  release(projectDirectory: string): void {
    const references = this.references.get(projectDirectory) ?? 0;
    if (references > 1) {
      this.references.set(projectDirectory, references - 1);
      return;
    }
    this.references.delete(projectDirectory);
    const store = this.stores.get(projectDirectory);
    if (store === undefined) return;
    this.stores.delete(projectDirectory);
    store.close();
  }

  dispose(): void {
    for (const store of this.stores.values()) store.close();
    this.stores.clear();
    this.references.clear();
  }
}
