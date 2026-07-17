import { elements } from "../../dom/elements.js";
import { state } from "../../state/appState.js";
import {
  CLOTHING_PREFERENCE_CATEGORIES,
  getSavedClothingPreferences,
  markClothingPreferencesSkipped,
  saveClothingPreferences,
  validateClothingPreferences
} from "../../domain/clothingPreferences.js";
import { rerenderLatestChecklist, startAppExperience } from "../checklist/checklist.js";

// Onboarding needs to resume its own step machine after a save/skip here, but
// this module must not import features/onboarding/onboarding.js back (that
// would be circular, since onboarding already imports showClothingPreferencesScreen
// from this file). Onboarding registers these two callbacks instead.
let onOnboardingContinue = () => {};
let onOnboardingSkip = () => {};

export function setOnboardingContinueHandler(handler) {
  onOnboardingContinue = handler;
}

export function setOnboardingSkipHandler(handler) {
  onOnboardingSkip = handler;
}

export function initClothingPreferencesUI() {
  renderClothingPreferenceCategories();
  elements.editClothingPreferencesButton.addEventListener("click", () => showClothingPreferencesScreen("settings"));
  elements.clothingPreferencesForm.addEventListener("submit", handleClothingPreferencesSave);
  elements.clothingPreferencesSkip.addEventListener("click", handleClothingPreferencesSkip);
}

export function showClothingPreferencesScreen(mode) {
  state.clothingPreferencesMode = mode;
  renderClothingPreferenceCategories();
  elements.clothingPreferencesMessage.textContent = "";
  elements.clothingPreferencesScreen.hidden = false;
  elements.clothingPreferencesScreen.scrollTop = 0;
}

export function hideClothingPreferencesScreen() {
  elements.clothingPreferencesScreen.hidden = true;
}

export function renderClothingPreferenceCategories() {
  const savedPreferences = getSavedClothingPreferences();
  const categorySections = CLOTHING_PREFERENCE_CATEGORIES.map((category) => createClothingPreferenceCategory(
    category,
    savedPreferences[category.id] ?? []
  ));

  elements.clothingPreferenceCategories.replaceChildren(...categorySections);
}

function createClothingPreferenceCategory(category, selectedOptions) {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const helper = document.createElement("p");
  const chipGroup = document.createElement("div");
  const selectedSet = new Set(selectedOptions);

  section.className = "preference-category";
  heading.textContent = category.label;
  helper.textContent = "Choose at least one";
  chipGroup.className = "preference-chip-group";

  chipGroup.replaceChildren(...category.options.map((option) => createClothingPreferenceChip(category.id, option, selectedSet.has(option))));
  section.append(heading, helper, chipGroup);

  return section;
}

function createClothingPreferenceChip(categoryId, option, selected) {
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  const text = document.createElement("span");

  label.className = "preference-chip";
  checkbox.type = "checkbox";
  checkbox.name = categoryId;
  checkbox.value = option;
  checkbox.checked = selected;
  text.textContent = option;

  label.append(checkbox, text);
  return label;
}

function handleClothingPreferencesSave(event) {
  event.preventDefault();

  const preferences = getClothingPreferencesFromForm();
  const validation = validateClothingPreferences(preferences);

  if (!validation.valid) {
    elements.clothingPreferencesMessage.textContent = `Choose at least one item for ${formatMissingPreferenceCategories(validation.missingCategories)}.`;
    return;
  }

  try {
    saveClothingPreferences(preferences);
    hideClothingPreferencesScreen();
    elements.appStatus.textContent = "Clothing preferences saved on this device only.";

    if (state.clothingPreferencesMode === "onboarding") {
      onOnboardingContinue();
      return;
    }

    if (rerenderLatestChecklist("clothing_preferences_updated")) {
      elements.appStatus.textContent = "Clothing preferences saved. Checklist updated.";
      return;
    }

    startAppExperience();
  } catch (error) {
    elements.clothingPreferencesMessage.textContent = "Preferences could not be saved on this device.";
  }
}

function handleClothingPreferencesSkip() {
  if (state.clothingPreferencesMode === "onboarding") {
    markClothingPreferencesSkipped();
    hideClothingPreferencesScreen();
    onOnboardingSkip();
    return;
  }

  hideClothingPreferencesScreen();
  elements.appStatus.textContent = "Clothing preferences skipped. You can edit them from Settings.";
  startAppExperience();
}

function getClothingPreferencesFromForm() {
  return CLOTHING_PREFERENCE_CATEGORIES.reduce((preferences, category) => {
    preferences[category.id] = [...elements.clothingPreferencesForm.querySelectorAll(`input[name="${category.id}"]:checked`)]
      .map((input) => input.value);

    return preferences;
  }, {});
}

function formatMissingPreferenceCategories(categories) {
  if (categories.length <= 1) {
    return categories[0] ?? "each category";
  }

  return `${categories.slice(0, -1).join(", ")} and ${categories.at(-1)}`;
}
