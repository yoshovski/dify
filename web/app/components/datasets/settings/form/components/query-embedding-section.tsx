'use client'
import type { DatasetDetailResponse } from '@dify/contracts/api/console/datasets/types.gen'
import type { ProviderWithModelsResponse } from '@dify/contracts/api/console/workspaces/types.gen'
import type { DefaultModel } from '@/app/components/header/account-setting/model-provider-page/declarations'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  queryModel: DefaultModel | null
  onChange: (value: DefaultModel | null) => void
  options: NonNullable<DatasetDetailResponse['query_embedding_options']>
  models: ProviderWithModelsResponse[]
  valid: boolean
  readonly: boolean
  enabled: boolean
}

export default function QueryEmbeddingSection({
  queryModel,
  onChange,
  options,
  models,
  valid,
  readonly,
  enabled,
}: Props) {
  const { t } = useTranslation()
  const id = useId()
  const available = enabled
    ? options.filter((option) =>
        models.some(
          (provider) =>
            provider.provider === option.provider &&
            provider.status === 'active' &&
            provider.models.some(
              (model) => model.model === option.query_model && model.status === 'active',
            ),
        ),
      )
    : []
  const selected = available.findIndex(
    (option) =>
      option.provider === queryModel?.provider && option.query_model === queryModel?.model,
  )
  const unavailable = queryModel !== null && selected === -1
  return (
    <div className="flex gap-x-1">
      <label htmlFor={id} className="w-45 shrink-0 pt-1 system-sm-semibold text-text-secondary">
        {t(($) => $['form.queryEmbeddingModel'], { ns: 'datasetSettings' })}
      </label>
      <div className="grow">
        <select
          id={id}
          aria-describedby={`${id}-help`}
          aria-invalid={!valid || unavailable}
          disabled={readonly}
          value={queryModel === null ? 'same' : unavailable ? 'unavailable' : String(selected)}
          onChange={(event) => {
            if (event.target.value === 'same') onChange(null)
            else {
              const option = available[Number(event.target.value)]
              if (option) onChange({ provider: option.provider, model: option.query_model })
            }
          }}
          className="w-full rounded-lg border border-divider-regular bg-components-input-bg-normal px-3 py-2 text-text-primary outline-offset-2 focus-visible:outline-2 focus-visible:outline-components-input-border-active"
        >
          <option value="same">
            {t(($) => $['form.queryEmbeddingSame'], { ns: 'datasetSettings' })}
          </option>
          {unavailable && (
            <option value="unavailable" disabled>
              {queryModel.model}
            </option>
          )}
          {available.map((option, index) => (
            <option key={`${option.provider}/${option.query_model}`} value={index}>
              {option.query_model}
            </option>
          ))}
        </select>
        <p id={`${id}-help`} className="mt-2 body-xs-regular text-text-tertiary">
          {t(
            ($) =>
              available.length ? $['form.queryEmbeddingHelp'] : $['form.queryEmbeddingUnsupported'],
            { ns: 'datasetSettings' },
          )}
        </p>
        {(!valid || unavailable) && (
          <p role="alert" className="mt-1 body-xs-regular text-text-warning-secondary">
            {t(($) => $['form.queryEmbeddingInvalid'], { ns: 'datasetSettings' })}
          </p>
        )}
      </div>
    </div>
  )
}
