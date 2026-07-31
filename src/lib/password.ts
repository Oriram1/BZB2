export const PASSWORD_MIN_LENGTH = 6;

export const isStrongPassword = (password: string): boolean =>
  password.length >= PASSWORD_MIN_LENGTH &&
  /[A-Za-z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9\s]/.test(password);

export const passwordRequirementsMessage =
  "הסיסמה צריכה לכלול לפחות 6 תווים, אותיות, מספרים וסימן מיוחד (לדוגמה: @)";
