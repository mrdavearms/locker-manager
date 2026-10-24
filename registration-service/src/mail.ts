import nodemailer from 'nodemailer'
import type { Mailer, Registration } from './logic'

export interface Email {
  subject: string
  text: string
}

/** Sends plain-text email from the Gmail account, with an app password, as Hunt 1000 does. */
export function gmailMailer(user: string, appPassword: string): Mailer {
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass: appPassword }
  })
  return {
    async send(to, subject, text) {
      await transport.sendMail({
        from: `Dave Armstrong <${user}>`,
        to,
        // A school name with a line break must never add an email header.
        subject: subject.replace(/[\r\n]+/g, ' '),
        text
      })
    }
  }
}

export function sentFrom(row: Registration): string {
  if (row.source === 'website') return 'the website'
  return row.appVersion ? `the app, version ${row.appVersion}` : 'the app'
}

export function toDaveEmail(row: Registration, reviewLink: string): Email {
  return {
    subject: `New Locker Manager registration: ${row.school}`,
    text: [
      `Registration ${row.id}`,
      '',
      `Name: ${row.name}`,
      `School: ${row.school}`,
      `Email: ${row.email}`,
      `State: ${row.state}`,
      `Role: ${row.role ?? '(not given)'}`,
      `Sent from: ${sentFrom(row)}`,
      '',
      'To approve or reject it, open this page and press a button there:',
      reviewLink,
      ''
    ].join('\n')
  }
}

/** Holds nothing the sender typed, so the form can never be used to send chosen words to a stranger. */
export function receivedEmail(): Email {
  return {
    subject: "We've received your Locker Manager registration",
    text: [
      'Thanks for registering with Locker Manager. Dave Armstrong checks each registration by hand, usually within a day. Your registration key will come to this address.',
      '',
      "If you didn't register, you can ignore this email.",
      '',
      'Dave Armstrong',
      ''
    ].join('\n')
  }
}

/** To Dave only, once, when a flood of registrations stops the emails for the day. */
export function emailsPausedEmail(): Email {
  return {
    subject: 'Locker Manager registrations: emails paused',
    text: 'More than 50 registrations arrived in the last 24 hours, so the service has stopped sending emails for now. The registrations are still saved. Check the list page.'
  }
}

export function keyEmail(row: Registration, key: string): Email {
  return {
    subject: `Your Locker Manager registration key for ${row.school}`,
    text: [
      '1. Open Locker Manager.',
      '2. Choose "I have a key" (or Help, then Registration).',
      '3. Paste this key and press Register:',
      '',
      key,
      '',
      "This key covers every computer that opens your school's Locker Manager file.",
      '',
      'Dave Armstrong',
      ''
    ].join('\n')
  }
}

export function rejectEmail(): Email {
  return {
    subject: 'Your Locker Manager registration',
    text: [
      "Thanks for your interest in Locker Manager. I wasn't able to confirm this registration as a school. If you think this is a mistake, reply to this email.",
      '',
      'Dave Armstrong',
      ''
    ].join('\n')
  }
}
