#!/usr/bin/env node
import { main } from "./run.js";

// `edr`            → asks whether to create an ADR or an RFC
// `edr adr|rfc`    → starts that interview directly
main("edr");
