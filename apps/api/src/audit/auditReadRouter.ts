import { Router } from 'express'
import {
  requirePermission,
} from '../auth/requirePermission.js'
import {
  auditReadHandler,
} from './auditReadHandler.js'

export const auditReadRouter = Router()

auditReadRouter.get(
  '/',
  requirePermission('AUDIT_READ'),
  auditReadHandler,
)