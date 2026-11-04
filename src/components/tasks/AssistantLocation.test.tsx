import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AssistantLocation from "./AssistantLocation";

const search = vi.hoisted(() => vi.fn());
vi.mock("@/lib/searchTaskPlaces", () => ({ searchTaskPlaces: search }));
vi.mock("./GoogleMapsProvider", () => ({ useGoogleMaps: () => ({ isLoaded: true, error: null, retry: vi.fn() }) }));
vi.mock("./GoogleMapPicker", () => ({
  default: ({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) =>
    <button onClick={() => onLocationSelect(32.1, 34.8)}>סימון נקודה במפה</button>,
}));

beforeEach(() => search.mockReset());
afterEach(cleanup);

it("requires selecting an exact point for a city result", async () => {
  search.mockResolvedValue([{ name: "תל אביב", formattedAddress: "תל אביב, ישראל", lat: 32.08, lng: 34.78, precise: false }]);
  const onConfirm = vi.fn();
  render(<AssistantLocation query="תל אביב" onConfirm={onConfirm} />);
  await screen.findByText("זהו אזור כללי. הזינו כתובת מדויקת או סמנו את נקודת המפגש במפה.");
  expect(screen.getByRole("button", { name: "אישור נקודת המפגש" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "סימון נקודה במפה" }));
  fireEvent.click(screen.getByRole("button", { name: "אישור נקודת המפגש" }));
  expect(onConfirm).toHaveBeenCalledWith({ query: "תל אביב", formattedAddress: "תל אביב, ישראל", lat: 32.1, lng: 34.8 });
});

it("requires a choice when a landmark has multiple matches", async () => {
  search.mockResolvedValue([
    { name: "בית ספר ראשון", formattedAddress: "רחוב א 1", lat: 32, lng: 34, precise: true },
    { name: "בית ספר שני", formattedAddress: "רחוב ב 2", lat: 33, lng: 35, precise: true },
  ]);
  const onConfirm = vi.fn();
  render(<AssistantLocation query="בית ספר" onConfirm={onConfirm} />);
  const second = await screen.findByRole("button", { name: /בית ספר שני/ });
  expect(screen.getByRole("button", { name: "אישור נקודת המפגש" })).toBeDisabled();
  fireEvent.click(second);
  fireEvent.click(screen.getByRole("button", { name: "אישור נקודת המפגש" }));
  expect(onConfirm).toHaveBeenCalledWith({ query: "בית ספר", formattedAddress: "רחוב ב 2", lat: 33, lng: 35 });
});

it("keeps confirmation blocked after a search failure and supports retry", async () => {
  search.mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValueOnce([]);
  render(<AssistantLocation query="מקום" onConfirm={vi.fn()} />);
  await screen.findByText(/חיפוש המקום לא הצליח/);
  expect(screen.getByRole("button", { name: "אישור נקודת המפגש" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
  await screen.findByText(/לא נמצא מקום מתאים/);
  expect(search).toHaveBeenCalledTimes(2);
});
