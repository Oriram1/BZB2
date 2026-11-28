/** A completed job belongs in the performer's history only if they were accepted. */
export function completedPerformingTasks<T extends { status: string; applicationStatus: string }>(tasks: T[]): T[] {
  return tasks.filter((task) => task.status === "completed" && task.applicationStatus === "accepted");
}
