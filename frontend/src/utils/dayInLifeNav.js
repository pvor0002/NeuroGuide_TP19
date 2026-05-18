export const DAY_IN_LIFE_LIST_PATH = "/day-in-life";
export const DIL_LAST_PARAMS_KEY = "dil_last_params";

export function clearDayInLifeSessionParams() {
  try {
    sessionStorage.removeItem(DIL_LAST_PARAMS_KEY);
  } catch {
    /* ignore */
  }
}

/** Return to the day-in-life job picker (clears URL params and stored last-open job). */
export function goToDayInLifeListing(navigate) {
  clearDayInLifeSessionParams();
  navigate({ pathname: DAY_IN_LIFE_LIST_PATH, search: "" }, { replace: true, state: null });
}
