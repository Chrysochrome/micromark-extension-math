/**
 * @import {Options} from 'micromark-extension-math-brackets'
 * @import {Extension} from 'micromark-util-types'
 */

import {codes} from 'micromark-util-symbol'
import {mathFlow} from './math-flow.js'
import {mathText} from './math-text.js'
import {mathBracketFlow} from './math-bracket-flow.js'
import {mathParensText} from './math-parens-text.js'

/**
 * Create an extension for `micromark` to enable math syntax.
 *
 * @param {Options | null | undefined} [options={}]
 *   Configuration (default: `{}`).
 * @returns {Extension}
 *   Extension for `micromark` that can be passed in `extensions`, to
 *   enable math syntax.
 */
export function math(options) {
  return {
    flow: {
      [codes.dollarSign]: mathFlow,
      [codes.backslash]: mathBracketFlow
    },
    text: {
      [codes.dollarSign]: mathText(options),
      [codes.backslash]: mathParensText(options)
    }
  }
}
