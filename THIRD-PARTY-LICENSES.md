# Third-Party Licenses

## @neaps/tide-predictor

`src/engine.js` is an inlined, unmodified copy of the harmonic tide-prediction
engine from [`@neaps/tide-predictor`](https://github.com/openwatersio/neaps/tree/main/packages/tide-predictor)
(published under the `neaps` npm scope; source lives in the `openwatersio/neaps`
monorepo). It is reproduced here verbatim (no imports, self-contained) rather
than imported as an npm dependency, per this project's zero-runtime-deps
constraint.

Upstream license text (MIT), reproduced verbatim from the project's root
`LICENSE` file:

```
MIT License

Copyright (c) 2019 Kevin Miller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
