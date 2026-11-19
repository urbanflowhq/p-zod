import * as z from "zod";

// Validate and copy storage data without dropping special object keys.
export const jsonDataSchema = z.transform((input, ctx): z.JSONType => {
  const active = new Set<object>();
  function copy(value: unknown, path: PropertyKey[]): z.JSONType {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      value === null ||
      typeof value !== "object" ||
      (!Array.isArray(value) &&
        Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
    ) {
      ctx.addIssue({
        code: "custom",
        path,
        message: "Expected JSON data with finite numbers",
      });
      return null;
    }
    if (active.has(value)) {
      ctx.addIssue({
        code: "custom",
        path,
        message: "JSON data cannot contain object cycles",
      });
      return null;
    }
    active.add(value);
    const result = Array.isArray(value)
      ? Array.from(value, (child, index) => copy(child, [...path, index]))
      : Object.fromEntries(
          Object.entries(value).map(([key, child]) => [
            key,
            copy(child, [...path, key]),
          ]),
        );
    if (
      Object.getOwnPropertySymbols(value).some((key) =>
        Object.prototype.propertyIsEnumerable.call(value, key),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path,
        message: "JSON data cannot contain symbol keys",
      });
    }
    active.delete(value);
    return result;
  }
  return copy(input, []);
});
