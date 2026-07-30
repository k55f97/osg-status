import { Alert, Text } from '@mantine/core'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

/**
 * Empty state of the incidents list.
 *
 * `noData` separates "we looked and there was nothing" from "we could not look".
 * Without that distinction a broken data path renders as a clean bill of health.
 */
export default function NoIncidentsAlert({
  style,
  noData = false,
}: {
  style?: React.CSSProperties
  noData?: boolean
}) {
  const { t } = useTranslation('common')
  return (
    <Alert
      icon={noData ? <IconAlertTriangle /> : <IconInfoCircle />}
      title={
        <span
          style={{
            fontSize: '1rem',
            fontWeight: 700,
          }}
        >
          {noData ? t('No incident data') : t('No incidents in this month')}
        </span>
      }
      color={noData ? 'orange' : 'gray'}
      withCloseButton={false}
      style={{
        position: 'relative',
        margin: '16px auto 0 auto',
        ...style,
      }}
    >
      <Text>
        {noData ? t('Incident data unavailable') : t('There are no incidents for this month')}
      </Text>
    </Alert>
  )
}
