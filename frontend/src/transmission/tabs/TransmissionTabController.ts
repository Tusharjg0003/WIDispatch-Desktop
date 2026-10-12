// Transmission strips (pump stations, and systems with their own options) on
// the shared record-tab controller. The defaults are the pump-station strip.

import { transmissionTabStore } from "./transmissionTabStore.ts";
import { DEFAULT_SUB_TAB, LIST_TAB_TITLE, isPumpStationSubTab } from "./transmissionTab.types.ts";
import type { TransmissionTabState } from "./transmissionTab.types.ts";
import { RecordTabController } from "../../tabs/controller/RecordTabController.ts";
import type { RecordTabControllerDeps, TabNavigator } from "../../tabs/controller/RecordTabController.ts";

export type { TabNavigator };

export type TransmissionTabControllerDeps = Partial<RecordTabControllerDeps<TransmissionTabState>> &
  Pick<RecordTabControllerDeps<TransmissionTabState>, "storage">;

export class TransmissionTabController extends RecordTabController<TransmissionTabState> {
  constructor(deps: TransmissionTabControllerDeps) {
    super({
      store: transmissionTabStore,
      basePath: "/transmission/pump-stations",
      listTitle: LIST_TAB_TITLE,
      isSubTab: isPumpStationSubTab,
      defaultSubTab: DEFAULT_SUB_TAB,
      label: "transmission",
      ...deps,
    });
  }

  openPumpStation(pumpStationId: string, name?: string): string {
    return this.openRecord(pumpStationId, name);
  }
}
