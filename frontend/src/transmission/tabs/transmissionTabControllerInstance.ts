import { TransmissionTabController } from "./TransmissionTabController.ts";
import { createTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

export const transmissionTabController = new TransmissionTabController({
  storage: createTabSessionStorage("transmission-pump-stations"),
});
