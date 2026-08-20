import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { importLibrary } = vi.hoisted(() => ({ importLibrary: vi.fn() }));

vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: vi.fn(),
  importLibrary,
}));

import { GoogleMapsProvider, useGoogleMaps } from "./GoogleMapsProvider";

const Consumer = () => {
  const { isLoaded, error, retry } = useGoogleMaps();
  return (
    <div>
      <span>{isLoaded ? "loaded" : error || "loading"}</span>
      <button type="button" onClick={retry}>retry</button>
    </div>
  );
};

describe("GoogleMapsProvider", () => {
  beforeEach(() => {
    importLibrary.mockReset();
  });

  it("allows a failed Maps load to be retried", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    importLibrary
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({});

    render(<GoogleMapsProvider><Consumer /></GoogleMapsProvider>);

    expect(await screen.findByText(/Google Maps לא נטען/)).toBeInTheDocument();
    await act(async () => { screen.getByRole("button", { name: "retry" }).click(); });

    expect(await screen.findByText("loaded")).toBeInTheDocument();
    expect(importLibrary).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
