import "@lowlighter/matcha/dist/matcha.css";
import "./main.css";
import ICAL from "ical.js";
import ky from "ky";
import { add, set, isWithinInterval } from "date-fns";

// set up location stuff

const locations = await ky.get("data/locations.json").json();
const locationsByCountry = Object.groupBy(locations, ({ country }) => country);

const destinationEl = document.getElementById("destination");

destinationEl.querySelectorAll("optgroup").forEach((el) => el.remove());
destinationEl.append(
  ...Object.entries(locationsByCountry).map(([country, cities]) => {
    const optionEls = cities
      .sort((a, b) => a.location.localeCompare(b.location))
      .map((city) => {
        const optionEl = document.createElement("option");
        optionEl.value = city.team;
        optionEl.textContent = city.location;

        return optionEl;
      });

    const optgroupEl = document.createElement("optgroup");
    optgroupEl.label = country;
    optgroupEl.append(...optionEls);

    return optgroupEl;
  })
);

// ical stuff

const calData = ICAL.parse(await ky.get("data/all.ics").text());
const allEvents = new ICAL.Component(calData)
  .getAllSubcomponents("vevent")
  .map((component) => new ICAL.Event(component))
  .sort((a, b) => a.startDate.toJSDate() - b.startDate.toJSDate());

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
