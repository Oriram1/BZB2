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
  expect(postAuthStep([], "bee")).toEqual({ to: "/register/bee?google=1" });
  expect(postAuthStep([], null)).toEqual({ to: "/auth?google=1" });
});

it("recognizes either role on an account that holds both", () => {
  expect(postAuthStep(["tasker", "bee"], "bee")).toEqual({ to: "/tasks" });
  expect(postAuthStep(["bee", "tasker"], "tasker")).toEqual({ to: "/tasks" });
});

it("does not mistake an admin grant for the account's functional role", () => {
  expect(postAuthStep(["admin", "bee"], "tasker")).toEqual({ switchFrom: "bee", switchTo: "tasker" });
});
