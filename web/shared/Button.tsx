import { Component, JSX } from 'solid-js'

type ButtonSchema = keyof typeof kinds

const kinds = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  grey: 'btn-secondary',
  gray: 'btn-secondary',
  clear: 'btn-clear',
  red: 'btn-red',
  error: 'btn-red',
  success: 'btn-green',
  green: 'btn-green',
  warning: 'btn-orange',
} satisfies { [key: string]: string }

const sizes = {
  sm: 'py-1 text-sm',
  md: 'py-2',
  lg: 'py-4 text-lg',
}

const Button: Component<{
  children: JSX.Element
  onClick?: JSX.EventHandler<HTMLButtonElement, MouseEvent>
  schema?: ButtonSchema
  type?: 'submit' | 'reset' | 'button'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  class?: string
}> = (props) => (
  <button
    type={props.type || 'button'}
    class={
      `${kinds[props.schema || 'primary']} select-none items-center ${sizes[props.size || 'md']} ` +
      props.class
    }
    disabled={props.disabled}
    onClick={props.onClick}
  >
    {props.children}
  </button>
)

export default Button
