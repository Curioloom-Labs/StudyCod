// Thin re-export: the palette now lives in components/interface/CommandPalette
// so every shell can share it. Kept so existing Nova imports keep working.
export { CommandPalette as NovaCommandPalette } from "../../components/interface/CommandPalette";
export type {
  PaletteItem as NovaPaletteItem,
  PaletteAction as NovaPaletteAction
} from "../../components/interface/CommandPalette";
