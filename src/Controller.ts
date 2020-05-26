import {
  EventOptions,
  StateKey,
  State,
  Fn,
  ReactEventHandlerKey,
  ReactEventHandlers,
  InternalConfig,
  InternalHandlers,
  RecognizerClass,
} from './types'
import { getInitialState } from './utils/state'
import { chainFns } from './utils/utils'

type GestureTimeouts = { [stateKey in StateKey]?: number }
type WindowListeners = { [stateKey in StateKey]?: [string, Function][] }
//type Bindings = Partial<{ [eventName in ReactEventHandlerKey]: Fn[] }>

/**
 * The controller will keep track of the state for all gestures and also keep
 * track of timeouts, and window listeners.
 *
 * @template BinderType the type the bind function should return
 */
export default class Controller {
  
  constructor(private classes: Set<RecognizerClass>) { }


  public bind = (...args: any[]) => {
    const bindings: { [key: string]: Function[] } = {}

    for (let RecognizerClass of this.classes) new RecognizerClass(this, args).addBindings(bindings)
    for (let [event, handler] of Object.entries(this.nativeRefs)) addBindings(bindings, event, handler)
    
    if (this.config.domTarget) {
      return updateDomListeners(this, bindings)
    } else {
      return getPropsListener(this, bindings)
    }
  }

  public effect = () => {
    if (this.config.domTarget) this.bind()
    return this.clean
  }

  public nativeRefs!: any
  public config!: InternalConfig
  public handlers!: Partial<InternalHandlers>
  public state: State = getInitialState() // state for all gestures
  public timeouts: GestureTimeouts = {} // keeping track of timeouts for debounced gestures (such as move, scroll, wheel)
  public domListeners: [string, Fn][] = [] // when config.domTarget is set, we attach events directly to the dom
  private windowListeners: WindowListeners = {} // keeps track of window listeners added by gestures (drag only at the moment)

  /**
   * Function ran on component unmount: cleans timeouts and removes dom listeners set by the bind function.
   */
  public clean = (): void => {
    const domTarget = getDomTargetFromConfig(this.config)
    const { eventOptions } = this.config

    if (domTarget) {
      removeListeners(domTarget, takeAll(this.domListeners), eventOptions)
    }

    Object.values(this.timeouts).forEach(clearTimeout)
    for (let key in this.windowListeners) this.removeWindowListeners(key as StateKey)
  }

  /**
   * Commodity function to let recognizers simply add listeners to config.window.
   */
  public addWindowListeners = (stateKey: StateKey, listeners: [string, Fn][] = []): void => {
    if (!this.config.window) return
    addListeners(this.config.window, listeners, this.config.eventOptions)
    this.windowListeners[stateKey] = listeners
  }

  /**
   * Commodity function to let recognizers simply remove listeners to config.window.
   */
  public removeWindowListeners = (stateKey: StateKey): void => {
    if (!this.config.window) return
    removeListeners(this.config.window, this.windowListeners[stateKey], this.config.eventOptions)
    delete this.windowListeners[stateKey]
  }
}


function updateDomListeners({ config, domListeners }: Controller, bindings: { [key: string]: Function[] }) {
  const domTarget = getDomTargetFromConfig(config)
  if (!domTarget) throw new Error("domTarget must be defined")
  const { eventOptions } = config

  removeListeners(domTarget, takeAll(domListeners), eventOptions)

  for (let [ key, fns ] of Object.entries(bindings)) {
      const name = key.slice(2).toLowerCase()
      domListeners.push([ name, chainFns(...fns)])
  }

  addListeners(domTarget, domListeners, eventOptions)
}

function getPropsListener({ config }: Controller, bindings: { [key: string]: Function[] }) {
  const props: ReactEventHandlers = {}
  const captureString = config.eventOptions.capture ? 'Capture' : ''
  for (let [ event, fns ] of Object.entries(bindings)) {
    const fnsArray = Array.isArray(fns) ? fns : [fns]
    const key = (event + captureString) as ReactEventHandlerKey
    props[key] = chainFns(...(fnsArray as Fn[]))
  }
  return props
}

function takeAll<T>(array: Array<T> = []) {
  return array.splice(0, array.length)
}


function getDomTargetFromConfig({ domTarget }: InternalConfig) {
  return domTarget && 'current' in domTarget ? domTarget.current : domTarget
}

/**
 * bindings is an object which keys match ReactEventHandlerKeys.
 * Since a recognizer might want to bind a handler function to an event key already used by a previously
 * added recognizer, we need to make sure that each event key is an array of all the functions mapped for
 * that key.
 */
export function addBindings(bindings: any, name: string, fn: Fn): void {
  if (!bindings[name]) bindings[name] = []
  bindings[name]!.push(fn)
}


function addListeners(el: EventTarget, listeners: Array<[string, Fn]> = [], options: EventOptions = {}) {
  for (let [eventName, eventHandler] of listeners) {
    el.addEventListener(eventName, eventHandler, options)
  }
}

function removeListeners(el: EventTarget, listeners: Array<[string, Fn]> = [], options: EventOptions = {}) {
  for (let [eventName, eventHandler] of listeners) {
    el.removeEventListener(eventName, eventHandler, options)
  }
}
