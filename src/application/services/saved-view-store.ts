import type { Memento } from 'vscode';
import {
  deserializeLogFilter,
  serializeLogFilter,
  type SavedView,
  type SerializedLogFilter
} from '../../domain/log-filter';

interface StoredSavedView {
  id: string;
  name: string;
  filter: SerializedLogFilter;
}

export class SavedViewStore {
  private static readonly storageKey = 'laravelLogs.savedViews';

  private readonly workspaceState: Memento;

  public constructor(workspaceState: Memento) {
    this.workspaceState = workspaceState;
  }

  public async list(): Promise<SavedView[]> {
    const storedViews = this.workspaceState.get<StoredSavedView[]>(SavedViewStore.storageKey, []);

    return storedViews.map((view) => ({
      id: view.id,
      name: view.name,
      filter: deserializeLogFilter(view.filter)
    }));
  }

  public async save(view: SavedView): Promise<SavedView[]> {
    const views = await this.list();
    const remaining = views.filter((candidate) => candidate.id !== view.id);
    remaining.push(view);

    await this.persist(remaining);
    return remaining;
  }

  public async remove(id: string): Promise<SavedView[]> {
    const views = await this.list();
    const remaining = views.filter((candidate) => candidate.id !== id);
    await this.persist(remaining);
    return remaining;
  }

  private async persist(views: SavedView[]): Promise<void> {
    const serializable: StoredSavedView[] = views.map((view) => ({
      id: view.id,
      name: view.name,
      filter: serializeLogFilter(view.filter)
    }));

    await this.workspaceState.update(SavedViewStore.storageKey, serializable);
  }
}
