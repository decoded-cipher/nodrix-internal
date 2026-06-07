// Entry for the local widget lab. Bundled to widget-bundle.js (IIFE) so the
// static index.html can load it over file:// with a plain <script> tag.
//
// Imports widget classes directly (not the full registry) to keep the bundle
// lean — avoids pulling in chart/map and their heavy deps. Add more here as
// the lab grows. Paths reach up out of the submodule into the parent repo's
// shared package, so build this from a full monorepo checkout.
import { IotColorElement } from '../../../shared/widgets/iot-color/widget';
import { IotSliderElement } from '../../../shared/widgets/iot-slider/widget';
import { IotToggleElement } from '../../../shared/widgets/iot-toggle/widget';

const defs: Array<[string, CustomElementConstructor]> = [
  ['iot-color', IotColorElement],
  ['iot-slider', IotSliderElement],
  ['iot-toggle', IotToggleElement],
];
for (const [tag, ctor] of defs) {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}
