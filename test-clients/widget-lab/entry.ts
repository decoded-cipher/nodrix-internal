// Entry for the local widget lab. Bundled to widget-bundle.js (IIFE) so the
// static index.html can load it over file:// with a plain <script> tag.
//
// Imports widget classes directly (not the full registry) to keep the bundle
// lean. apexcharts (chart) and leaflet (map) are NOT bundled — build.ts aliases
// their dynamic imports to CDN globals, and chart.html / map.html load those
// from a CDN. Paths reach up out of the submodule into the parent repo's shared
// package, so build this from a full monorepo checkout.
import { IotColorElement } from '../../../shared/widgets/iot-color/widget';
import { IotSliderElement } from '../../../shared/widgets/iot-slider/widget';
import { IotToggleElement } from '../../../shared/widgets/iot-toggle/widget';
import { IotValueElement } from '../../../shared/widgets/iot-value/widget';
import { IotGaugeElement } from '../../../shared/widgets/iot-gauge/widget';
import { IotPushElement } from '../../../shared/widgets/iot-push/widget';
import { IotPercentElement } from '../../../shared/widgets/iot-percent/widget';
import { IotChartElement } from '../../../shared/widgets/iot-chart/widget';
import { IotMapElement } from '../../../shared/widgets/iot-map/widget';

const defs: Array<[string, CustomElementConstructor]> = [
  ['iot-color', IotColorElement],
  ['iot-slider', IotSliderElement],
  ['iot-toggle', IotToggleElement],
  ['iot-value', IotValueElement],
  ['iot-gauge', IotGaugeElement],
  ['iot-push', IotPushElement],
  ['iot-percent', IotPercentElement],
  ['iot-chart', IotChartElement],
  ['iot-map', IotMapElement],
];
for (const [tag, ctor] of defs) {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}
