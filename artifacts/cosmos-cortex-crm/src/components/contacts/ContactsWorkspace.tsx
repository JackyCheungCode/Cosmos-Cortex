import { useState } from 'react';
import { Button } from '@carbon/react';
export default function ContactsWorkspace({ lang }: { lang: 'zh' | 'en' }) { return <main data-testid="page-contacts"><h1>{lang === 'zh' ? '联系人' : 'Contacts'}</h1><Button>{lang === 'zh' ? '新建联系人' : 'New contact'}</Button></main>; }
