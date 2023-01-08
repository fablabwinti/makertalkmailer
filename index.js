'use strict';

const fs = require('fs');
const crypto = require('crypto');
const ical = require('ical');
const get = require('bent')('string');
const { DateTime } = require('luxon');
const { convert } = require('html-to-text');
const nodemailer = require('nodemailer');

const secrets = require('./secrets.json');

const SENT_MESSAGES_FILE = __dirname + '/sent_messages.json';

// on Node.js < 13, luxon doesn't support locales without jumping through
// hoops, so hardcode some de-CH formats

function formatLongDate(datetime) {
	return ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][datetime.weekday]
	+ datetime.toFormat(', d. ')
	+ ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'][datetime.month]
	+ datetime.toFormat(' y');
}

function formatShortDate(datetime) {
	return datetime.toFormat('d.M.y');
}

function formatTime(datetime) {
	return datetime.toFormat('HH:mm');
}

async function main() {
	let sent = [];
	try {
		sent = JSON.parse(fs.readFileSync(SENT_MESSAGES_FILE));
	}
	catch (e) {}
	// try writing so we fail early if we lack permission
	fs.writeFileSync(SENT_MESSAGES_FILE, JSON.stringify(sent));

	const text = await get('https://calendar.google.com/calendar/ical/9pcde79b1b076h1nrb1ki2ge08%40group.calendar.google.com/public/basic.ics');
	const data = ical.parseICS(text);
	let evcount = 0;
	let talkcount = 0;
	let intvcount = 0;
	let talks = [];
	const intervalStart = new Date();
	const intervalEnd = new Date(intervalStart.getTime() + 6.5*24*60*60*1000);
	for (let k in data) {
		if (data.hasOwnProperty(k)) {
			var ev = data[k];
			if (ev.type === 'VEVENT') {
				evcount += 1;
				if (ev.summary.startsWith('MakerTalk:')) {
					talkcount += 1;
					if (intervalStart <= ev.start && ev.start < intervalEnd) {
						intvcount += 1;
						let title = ev.summary.substring(10).trim();
						let date = DateTime.fromJSDate(ev.start).setLocale('de-CH');
						let referent = null;
						let referentTotal = null;
						let description = ev.description.replace(
							/(^|(<br>)+)(Referent[^:]*:([^<]*))($|(<br>)+)/,
							(_, g1, __, g3, g4, g5) => {
								referent = g4.trim();
								referentTotal = g3.trim();
								return (g1.length > g5.length) ? g1 : g5;
							}
						);
						let html = `<em>Nächster MakerTalk im FabLab Winti:</em>
<h3>${formatLongDate(date)} – Türöffnung ${formatTime(date)} – Beginn ${formatTime(date.plus({minutes: 30}))}</h3>
<h2>${title}</h2>${referentTotal ? `\n<h3>${referentTotal}</h3>` : ''}
<p>${description}</p>
`;
						let md5 = crypto.createHash('md5').update(html).digest('hex');
						if (!sent.includes(md5)) {
							talks.push([`MakerTalk am ${formatShortDate(date)}: ${title}`, html]);
						}
					}
				}
			}
		}
	}

	console.log(`${evcount} events in calendar
${talkcount} MakerTalks
${intvcount} in interval ${intervalStart.toISOString()} - ${intervalEnd.toISOString()}
${talks.length} not sent yet`);

	const transporter = nodemailer.createTransport(
		process.argv.includes('--dry-run')
		? {streamTransport: true, buffer: true, newline: 'windows'}
		: {
			host: 'mail.cyon.ch',
			auth: {
				user: "fg_makertalk@fablabwinti.ch",
				pass: secrets.smtp_password,
			}
		}
	);
	await Promise.all(talks.map(async ([subject, html]) => {
		let text = convert(html, {
			wordwrap: 72,
			formatters: {
				h2formatter: function(elem, walk, builder, formatOptions) {
					builder.openBlock({leadingLineBreaks: 0, reservedLineLength: 4});
					walk(elem.children, builder);
					builder.closeBlock({
						trailingLineBreaks: 2,
						blockTransform: text => '-'.repeat(builder.options.wordwrap || 40) + '\n' + text.replace(/^/mg, '  ') + '\n' + '-'.repeat(builder.options.wordwrap || 40)
					});
				}
			},
			selectors: [
				{selector: 'a', options: {hideLinkHrefIfSameAsText: true}},
				{selector: 'h2', format: 'h2formatter'},
				{selector: 'h3', options: {uppercase: false, leadingLineBreaks: 0}}
			]
		});
		let infos = await Promise.all([
			['notice@makertalk.ch', {'Approved': secrets.mailman_approval_password}],
			[secrets.tinyletter_submit_address, {}]
		].map(([recipient, extraheaders]) => transporter.sendMail({
			from: 'info@makertalk.ch',
			to: recipient,
			subject: subject,
			text: text,
			html: html,
			headers: extraheaders
		})));
		sent.push(crypto.createHash('md5').update(html).digest('hex'));
		fs.writeFileSync(SENT_MESSAGES_FILE, JSON.stringify(sent));
		console.log(infos);
		// dry-run output: message is only set for streamTransport, not for SMTP
		if (infos[0].message) {
			fs.writeFileSync('output.eml', infos[0].message);
			console.log('message written to output.eml');
		}
	}));
}

main().catch(console.error);
