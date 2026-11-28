import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MapView from "./MapView";

vi.mock("./GoogleMapsProvider", () => ({ useGoogleMaps: () => ({ isLoaded: true, error: null, retry: vi.fn() }) }));
vi.mock("./TaskCard", () => ({ default: () => null }));

const panTo = vi.fn();
const setZoom = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("google", { maps: {
    Map: class { panTo = panTo; setZoom = setZoom; fitBounds = vi.fn(); },
    LatLngBounds: class { extend = vi.fn(); },
    ControlPosition: { TOP_LEFT: 1 },
  } });
});

describe("MapView location control", () => {
  it("centres on an available location", () => {
    const position = { lat: 32.1, lng: 34.8 };
    render(<MapView tasks={[]} origin={position} onRequestLocation={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "התמקדות במיקום שלי" }));
    expect(panTo).toHaveBeenCalledWith(position);
    expect(setZoom).toHaveBeenCalledWith(14);
  });

  it("opens the location explanation when no location is available", () => {
    const requestLocation = vi.fn();
    const { rerender } = render(<MapView tasks={[]} origin={null} onRequestLocation={requestLocation} />);
    fireEvent.click(screen.getByRole("button", { name: "התמקדות במיקום שלי" }));
    expect(requestLocation).toHaveBeenCalledOnce();
    expect(panTo).not.toHaveBeenCalled();
    const position = { lat: 32.1, lng: 34.8 };
    rerender(<MapView tasks={[]} origin={position} onRequestLocation={requestLocation} />);
    expect(panTo).toHaveBeenCalledWith(position);
  });
});
