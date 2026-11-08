import { expect, it } from "vitest";
import { postAuthStep } from "./postAuth";

it("sends an existing account home when it matches the screen it signed in from", () => {
  expect(postAuthStep(["tasker"], "tasker")).toEqual({ to: "/tasks" });
  expect(postAuthStep(["bee"], null)).toEqual({ to: "/tasks" });
});

it("asks before moving an account that signed in from another role's screen", () => {
  expect(postAuthStep(["tasker"], "bee")).toEqual({ switchFrom: "tasker", switchTo: "bee" });
});

it("finishes registration for a Google account that has no role yet", () => {
  expect(postAuthStep([], "parent")).toEqual({ to: "/register/parent?google=1" });
  expect(postAuthStep([], null)).toEqual({ to: "/auth?google=1" });
});
