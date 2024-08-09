import "@lowlighter/matcha/dist/matcha.css";
import "./main.css";
import ICAL from "ical.js";
import ky from "ky";
import { add, set, isWithinInterval } from "date-fns";

// set up location stuff

const locations = await ky.get("data/locations.json").json();
const locationsByClassification = Object.groupBy(
  locations,
  ({ classification }) => classification
);

const generateLocationInputs = (cities) => {
  return cities.map((city) => {
    const inputEl = document.createElement("input");
    inputEl.type = "radio";
    inputEl.name = "destination";
    inputEl.value = city.team;
    inputEl.required = true;

    const flagEl = document.createElement("i");
    flagEl.classList.add("noto-color-emoji-regular", "px-.5");
    if (city.country === "Canada") {
      flagEl.textContent = "🇨🇦";
    } else {
      flagEl.textContent = "🇺🇸";
    }

    const labelEl = document.createElement("label");
    labelEl.textContent = city.location;
    labelEl.insertAdjacentElement("afterbegin", flagEl);
    labelEl.insertAdjacentElement("afterbegin", inputEl);

    const listEl = document.createElement("li");
    listEl.append(labelEl);

    return listEl;
  });
};

document
  .getElementById("destinations-group-a")
  .append(
    ...generateLocationInputs(
      Object.values(locationsByClassification.A).sort(
        (a, b) =>
          a.country.localeCompare(b.country) ||
          a.location.localeCompare(b.location)
      )
    )
  );

document
  .getElementById("destinations-group-b")
  .append(
    ...generateLocationInputs(
      Object.values(locationsByClassification.B).sort(
        (a, b) =>
          a.country.localeCompare(b.country) ||
          a.location.localeCompare(b.location)
      )
    )
  );

// ical stuff

const calFiles = ["data/2024-2025_a.ics", "data/2024-2025_b.ics"];
const allEvents = (
  await Promise.all(
    calFiles.map(async (file) => {
      const calData = ICAL.parse(await ky.get(file).text());
      return new ICAL.Component(calData)
        .getAllSubcomponents("vevent")
        .map((component) => new ICAL.Event(component))
        .sort((a, b) => a.startDate.toJSDate() - b.startDate.toJSDate());
    })
  )
)
  .flat()
  .filter((event) => event.summary.includes("@"));

const allEventsByTeam = Object.groupBy(allEvents, (event) =>
  event.summary.split("@")[1].trim()
);

const earliest = set(allEvents.at(0)?.startDate.toJSDate(), {
  hours: 0,
  minutes: 0,
  seconds: 0,
});
const latest = allEvents.at(-1)?.startDate.toJSDate();

// logical stuff

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "full",
  timeStyle: "short",
  hour12: false,
  timeZone: "America/Toronto",
});

/**
 * Perform computation
 * @param duration Number of days
 * @param applicableEvents Events to consider as exciting
 */
const computeOutput = (duration, applicableEvents) => {
  const output = {};

  let optimalExcitingDays = 0;

  for (
    let current = earliest;
    current < latest;
    current = add(current, { days: 1 })
  ) {
    const range = {
      start: current,
      end: add(current, { days: duration }),
    };
    const events = applicableEvents.filter((event) =>
      isWithinInterval(event.startDate.toJSDate(), range)
    );

    output[current.toISOString()] = { range, events };

    optimalExcitingDays = Math.max(optimalExcitingDays, events.length);
  }

  return {
    optimalExcitingDays,
    output,
  };
};

/**
 * Display the information for one range
 * @param duration
 * @param optimal
 * @param output
 */
const displayOneRangeOutput = (duration, optimal, output) => {
  const summaryEl = document.getElementById("summaryOutput");
  summaryEl.innerHTML = `An optimal vacation of ${duration} calendar day(s) in the selected destination contains <b>${optimal}</b> exciting day(s).`;

  const rows = Object.values(output)
    .filter((row) => row.events.length > 0)
    .map((row) => {
      const isOptimal = row.events.length === optimal;
      const rowEl = document.createElement("tr");
      rowEl.classList.add(isOptimal ? "optimal" : "suboptimal");

      rowEl.innerHTML = `
        <td>${dateFormatter.format(row.range.start)}</td>
        <td>${dateFormatter.format(row.range.end)}</td>
        <td>
          <ul>
            ${row.events
              .map(
                (event) =>
                  `<li>${dateFormatter.format(event.startDate.toJSDate())}`
              )
              .join("")}
          </ul>
        </td>
        <td>${isOptimal ? "Yes" : "No"}</td>`;

      return rowEl;
    });

  const detailedEl = document.getElementById("detailedOutput");
  detailedEl.innerHTML = "";
  detailedEl.append(...rows);
};

document.forms[0].addEventListener("submit", (e) => {
  e.preventDefault();

  const formData = new FormData(e.target);

  const duration = Number(formData.get("duration"));
  const team = formData.get("destination");
  const applicableEvents = allEventsByTeam[team];

  document.getElementById("oneDayOutput").hidden = duration === 0;
  document.getElementById("allDaysOutput").hidden = duration > 0;

  if (duration > 0) {
    const result = computeOutput(duration, applicableEvents);
    displayOneRangeOutput(duration, result.optimalExcitingDays, result.output);
  } else {
    const outputEl = document.getElementById("rawOutput");
    outputEl.textContent = "";

    for (let i = 2; i <= 15; ++i) {
      const result = computeOutput(i, applicableEvents);
      outputEl.textContent += `Optimal ranges for a vacation of ${i} calendar days:
  ${Object.values(result.output)
    .filter((row) => row.events.length === result.optimalExcitingDays)
    .map(
      (row) =>
        `from ${row.range.start.toISOString().slice(0, 10)} to ${row.range.end
          .toISOString()
          .slice(0, 10)} (num_exciting_days=${result.optimalExcitingDays})`
    )
    .join("\n  ")}

`;
    }
  }
});
