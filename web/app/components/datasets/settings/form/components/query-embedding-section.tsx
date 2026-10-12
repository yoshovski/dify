'use client'
import type { DatasetDetailResponse } from '@dify/contracts/api/console/datasets/types.gen'
import type { ProviderWithModelsResponse } from '@dify/contracts/api/console/workspaces/types.gen'
import type { DefaultModel } from '@/app/components/header/account-setting/model-provider-page/declarations'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectTrigger,
} from '@langgenius/dify-ui/select'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import ModelIcon from '@/app/components/header/account-setting/model-provider-page/model-icon'

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

  const selectedProvider = queryModel
    ? models.find((provider) => provider.provider === queryModel.provider)
    : undefined

  const selectValue = queryModel === null ? 'same' : unavailable ? 'unavailable' : String(selected)

  return (
    <div className="flex gap-x-1">
      <label htmlFor={id} className="w-45 shrink-0 pt-1 system-sm-semibold text-text-secondary">
        {t(($) => $['form.queryEmbeddingModel'], { ns: 'datasetSettings' })}
      </label>
      <div className="grow">
        <Select
          value={selectValue}
          onValueChange={(val) => {
            if (val === 'same') {
              onChange(null)
            } else if (val && val !== 'unavailable') {
              const option = available[Number(val)]
              if (option) onChange({ provider: option.provider, model: option.query_model })
            }
          }}
          disabled={readonly}
        >
          <SelectTrigger
            id={id}
            aria-describedby={`${id}-help`}
            aria-invalid={!valid || unavailable}
            aria-label={t(($) => $['form.queryEmbeddingModel'], { ns: 'datasetSettings' })}
            disabled={readonly}
            className="w-full"
          >
            <span className="flex items-center gap-2 truncate">
              {queryModel === null ? (
                <span className="truncate system-sm-regular text-text-primary">
                  {t(($) => $['form.queryEmbeddingSame'], { ns: 'datasetSettings' })}
                </span>
              ) : unavailable ? (
                <span className="truncate system-sm-regular text-text-secondary">
                  {queryModel.model}
                </span>
              ) : (
                <>
                  <ModelIcon
                    provider={selectedProvider}
                    modelName={queryModel.model}
                    className="size-4 shrink-0 p-0.5"
                  />
                  <span className="truncate system-sm-regular text-text-primary">
                    {queryModel.model}
                  </span>
                </>
              )}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="same">
              <SelectItemText>
                <span className="truncate system-sm-regular text-text-primary">
                  {t(($) => $['form.queryEmbeddingSame'], { ns: 'datasetSettings' })}
                </span>
              </SelectItemText>
              <SelectItemIndicator />
            </SelectItem>
            {unavailable && (
              <SelectItem value="unavailable" disabled>
                <SelectItemText>
                  <span className="truncate system-sm-regular text-text-secondary">
                    {queryModel.model}
                  </span>
                </SelectItemText>
                <SelectItemIndicator />
              </SelectItem>
            )}
            {available.map((option, index) => {
              const prov = models.find((provider) => provider.provider === option.provider)
              return (
                <SelectItem key={`${option.provider}/${option.query_model}`} value={String(index)}>
                  <span className="flex items-center gap-2 truncate">
                    <ModelIcon
                      provider={prov}
                      modelName={option.query_model}
                      className="size-4 shrink-0 p-0.5"
                    />
                    <SelectItemText>
                      <span className="truncate system-sm-regular text-text-primary">
                        {option.query_model}
                      </span>
                    </SelectItemText>
                  </span>
                  <SelectItemIndicator />
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
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
