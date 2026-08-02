export const getRoleHomePath = (role: string): string => {
  switch (role) {
    case "parent":
      return "/parent";
    case "tasker":
      return "/my-tasks";
    case "admin":
      return "/admin";
    case "bee":
    default:
      return "/tasks";
  }
};
